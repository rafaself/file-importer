import { Readable } from 'node:stream';
import { ImportRowStatus } from '@csv/shared';
import {
  CsvFileError,
  parseCustomerRows,
  type CustomerRowOutcome,
} from './csv-parser.js';

async function collect(source: Readable) {
  const rows: CustomerRowOutcome[] = [];
  for await (const row of parseCustomerRows(source)) rows.push(row);
  return rows;
}

describe('streaming CSV validation', () => {
  it('preserves raw strings and yields normalized values and field-specific issues', async () => {
    const source = Readable.from([
      'name,email,company\n Ana , ana@example.com , Example \nBob,invalid,Example\n,carol@example.com,Example\n',
    ]);
    const rows = await collect(source);

    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.status)).toEqual([
      ImportRowStatus.VALID,
      ImportRowStatus.INVALID,
      ImportRowStatus.INVALID,
    ]);
    expect(rows[0]).toMatchObject({
      rawValue: {
        name: ' Ana ',
        email: ' ana@example.com ',
        company: ' Example ',
      },
      normalized: { name: 'Ana', email: 'ana@example.com', company: 'Example' },
      issues: [],
    });
    expect(rows[1]).toMatchObject({
      normalized: null,
      issues: [expect.objectContaining({ field: 'email' })],
    });
    expect(rows[2]).toMatchObject({
      normalized: null,
      issues: [expect.objectContaining({ field: 'name' })],
    });
    expect(source.readableEnded).toBe(true);
  });

  it('handles quoted commas, escaped quotes, newlines, BOM, CRLF, and chunk boundaries', async () => {
    const csv =
      '\uFEFFname,email,company\r\nAna,ana@example.com,"North, East ""Ltd"""\r\nBob,bob@example.com,"First\nSecond"\r\n';
    const bytes = Buffer.from(csv);
    const rows = await collect(
      Readable.from(Array.from(bytes, (byte) => Buffer.from([byte]))),
    );

    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2]);
    expect(rows.map((row) => row.normalized?.company)).toEqual([
      'North, East "Ltd"',
      'First\nSecond',
    ]);
  });

  it('ignores completely empty lines without skipping comma-separated blank fields', async () => {
    const rows = await collect(
      Readable.from([
        '\nname,email,company\n\n,,\n\nAna,ana@example.com,Example\n',
      ]),
    );
    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2]);
    expect(rows.map((row) => row.status)).toEqual([
      ImportRowStatus.INVALID,
      ImportRowStatus.VALID,
    ]);
  });

  it('accepts a header-only file as zero data rows', async () => {
    await expect(
      collect(Readable.from(['name,email,company\n'])),
    ).resolves.toEqual([]);
  });

  it.each([
    '',
    '\n\n',
    'name,email\n',
    'email,name,company\n',
    'name,email,company,extra\n',
    ' name,email,company\n',
  ])('rejects missing or incorrect headers %j', async (csv) => {
    await expect(collect(Readable.from([csv]))).rejects.toThrow(
      'CSV header must be exactly name,email,company.',
    );
  });

  it.each([
    'Ana,ana@example.com',
    'Ana,ana@example.com,Example,extra',
    'Ana,ana@example.com,"unclosed',
    '   ',
  ])('treats malformed structure as a file-level failure', async (record) => {
    await expect(
      collect(Readable.from([`name,email,company\n${record}`])),
    ).rejects.toBeInstanceOf(CsvFileError);
  });

  it('limits record size without exposing raw content in the error', async () => {
    const csv = `name,email,company\n${'private'.repeat(10000)},ana@example.com,Example\n`;
    await expect(collect(Readable.from([csv]))).rejects.toThrow(
      'CSV is malformed or exceeds the record-size limit.',
    );
  });

  it('does not turn a late parsing failure into a successful import', async () => {
    const source = Readable.from(
      (async function* () {
        yield 'name,email,company\nAna,ana@example.com,Example\nB';
        yield 'ob,bob@example.com,"unclosed';
      })(),
    );
    const emitted: CustomerRowOutcome[] = [];
    async function consume() {
      for await (const row of parseCustomerRows(source)) {
        emitted.push(row);
      }
    }

    await expect(consume()).rejects.toBeInstanceOf(CsvFileError);
    expect(emitted.length).toBeLessThanOrEqual(1);
    expect(source.destroyed).toBe(true);
  });

  it('propagates source read errors and closes streams on early cancellation', async () => {
    const failure = new Error('Storage read failed');
    const failing = Readable.from(
      (async function* () {
        yield '';
        throw failure;
      })(),
    );
    await expect(collect(failing)).rejects.toBe(failure);

    const source = Readable.from([
      'name,email,company\nAna,ana@example.com,Example\nBob,bob@example.com,Example\n',
    ]);
    for await (const row of parseCustomerRows(source)) {
      expect(row.rowNumber).toBe(1);
      break;
    }
    expect(source.destroyed).toBe(true);
  });
});
