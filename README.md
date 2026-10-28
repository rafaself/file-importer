# File Importer

A file import application built with NestJS and TypeScript, starting with CSV and intended to support additional file formats.

The API stores uploaded files, records imports in PostgreSQL, and queues background jobs using BullMQ and Redis. The monorepo includes a separate NestJS worker, a React frontend, and shared packages for configuration, validation contracts, storage, and domain types.

The project is in active development. Upload intake and queue production are implemented; worker processing and the import dashboard are planned.
