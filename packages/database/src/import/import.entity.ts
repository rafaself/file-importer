import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from "typeorm";
import { ImportStatus } from "@csv/shared";
import { ImportRow } from "./import-row/import-row.entity.js";

@Entity({ name: "imports" })
@Check(`"totalRows" IS NULL OR "totalRows" >= 0`)
@Check(`"processedRows" >= 0`)
@Check(`"successRows" >= 0`)
@Check(`"failedRows" >= 0`)
@Check(`"successRows" + "failedRows" = "processedRows"`)
@Check(`"totalRows" IS NULL OR "processedRows" <= "totalRows"`)
export class Import {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 1024 })
  originalFileName: string;

  @Column({ unique: true })
  @Index("IDX_import_storage_key")
  storageKey: string;

  @Column({
    type: "enum",
    enum: ImportStatus,
    default: ImportStatus.PENDING,
  })
  status: ImportStatus;

  @Column({ type: "int", nullable: true })
  totalRows: number | null;

  @Column({ type: "int", default: 0 })
  processedRows: number;

  @Column({ type: "int", default: 0 })
  successRows: number;

  @Column({ type: "int", default: 0 })
  failedRows: number;

  @Column({ type: "varchar", length: 225, nullable: true })
  failureReason: string | null;

  @Column({ type: "timestamptz", nullable: true })
  startedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ImportRow, (rows) => rows.import, {
    cascade: ["insert"],
  })
  rows: Relation<ImportRow>[];
}
