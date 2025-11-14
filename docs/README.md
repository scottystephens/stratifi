# TreasuryX Documentation

Comprehensive documentation for the TreasuryX treasury management platform.

## Directory Structure

```
docs/
├── architecture/        # System architecture and design docs
├── guides/             # How-to guides and feature documentation
└── README.md           # This file
```

---

## 🏗️ Architecture (`architecture/`)

System design and architectural decisions:

- **DATA_INGESTION_ARCHITECTURE.md** - Multi-source data ingestion system design
  - Database architecture (single schema vs separate)
  - Connection types (BAI2, CSV, Plaid, SFTP)
  - Data flow and transformation
  - Security and compliance considerations

---

## 📚 Guides (`guides/`)

Feature documentation and how-to guides:

- **CSV_INGESTION_COMPLETE.md** - CSV import system documentation
  - Features and capabilities
  - Setup instructions
  - Configuration options
  - Troubleshooting

- **DEPLOYMENT_SUMMARY.md** - Production deployment guide
  - What's deployed
  - Test data information
  - Testing instructions
  - Support information

---

## 🚀 Quick Links

### Getting Started
1. [Architecture Overview](./architecture/DATA_INGESTION_ARCHITECTURE.md)
2. [CSV Import Guide](./guides/CSV_INGESTION_COMPLETE.md)
3. [Deployment Summary](./guides/DEPLOYMENT_SUMMARY.md)

### External Resources
- [Supabase Dashboard](https://supabase.com/dashboard/project/vnuithaqtpgbwmdvtxik)
- [Production App](https://treasuryx-pi.vercel.app)
- [GitHub Repository](https://github.com/scottystephens/treasuryx)

---

## 📝 Documentation Standards

When adding new documentation:

1. **Architecture docs** → `architecture/`
   - System design decisions
   - Database schemas
   - Integration patterns
   - Technical architecture

2. **Feature guides** → `guides/`
   - How-to guides
   - Feature documentation
   - User guides
   - Troubleshooting

3. **File naming**
   - Use UPPERCASE for major docs (e.g., `DATA_INGESTION_ARCHITECTURE.md`)
   - Use kebab-case for specific guides (e.g., `csv-import-guide.md`)
   - Include dates for time-sensitive docs (e.g., `deployment-2025-01.md`)

---

## 🔄 Keeping Docs Updated

- Update docs when making significant architectural changes
- Keep deployment summaries current
- Add troubleshooting entries when solving issues
- Link related docs together

---

## 📞 Need Help?

- Check the relevant guide in `guides/`
- Review architecture docs for design decisions
- See `../scripts/README.md` for script documentation

