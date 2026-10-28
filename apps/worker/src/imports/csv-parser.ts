import { customerRowSchema, type CustomerRowDto } from '@csv/contracts';
import { ImportRowStatus, type ImportRowIssue } from '@csv/shared';
import { CsvError, parse } from 'csv-parse';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HEADERS = ['name', 'email', 'company'];
const MAX_RECORD_SIZE = 64 * 1024;
const MAX_ISSUES = 10;

export class CsvFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFileError';
  }
}

export type CustomerRowRecord = {
  rowNumber: number;
  rawValue: CustomerRowDto;
};

type RowBase = CustomerRowRecord;
export type CustomerRowOutcome = RowBase &
  (
    | { status: ImportRowStatus.VALID; normalized: CustomerRowDto; issues: [] }
    | {
        status: ImportRowStatus.INVALID;
        normalized: null;
        issues: ImportRowIssue[];
      }
  );

export async function* parseCustomerRecords(
  source: Readable,
): AsyncGenerator<CustomerRowRecord> {
  let headerSeen = false;
  const parser = parse({
    bom: true,
    encoding: 'utf8',
    // Ignore completely empty lines; whitespace-only records still undergo parsing.
    skip_empty_lines: true,
    max_record_size: MAX_RECORD_SIZE,
    columns(headers: string[]) {
      if (
        headers.length !== HEADERS.length ||
        headers.some((value, index) => value !== HEADERS[index])
      ) {
        throw new CsvFileError(
          'CSV header must be exactly name,email,company.',
        );
      }
      headerSeen = true;
      return headers;
    },
  });

  // Handle pipeline rejection immediately while the iterator consumes its output.
  const transferred = pipeline(source, parser).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  try {
    let rowNumber = 0;
    for await (const record of parser) {
      // Exact columns and the parser's default string output establish this shape.
      const rawValue = record as CustomerRowDto;
      rowNumber++;
      yield { rowNumber, rawValue };
    }

    const transfer = await transferred;
    if (!transfer.ok) throw transfer.error;
    if (!headerSeen)
      throw new CsvFileError('CSV header must be exactly name,email,company.');
  } catch (error) {
    if (error instanceof CsvError) {
      // Parser messages can contain field values; expose a fixed file-level reason.
      throw new CsvFileError(
        'CSV is malformed or exceeds the record-size limit.',
      );
    }
    throw error;
  } finally {
    parser.destroy();
    source.destroy();
    await transferred;
  }
}

export async function* parseCustomerRows(
  source: Readable,
): AsyncGenerator<CustomerRowOutcome> {
  for await (const record of parseCustomerRecords(source)) {
    const result = customerRowSchema.safeParse(record.rawValue);
    if (result.success) {
      yield {
        ...record,
        status: ImportRowStatus.VALID,
        normalized: result.data,
        issues: [],
      };
    } else {
      yield {
        ...record,
        status: ImportRowStatus.INVALID,
        normalized: null,
        issues: result.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message.slice(0, 160),
        })),
      };
    }
  }
}
