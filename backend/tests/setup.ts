process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://bsc:bsc@localhost:5432/bsc_test';
process.env.NODE_ENV = 'test';
process.env.ADMIN_INITIAL_PASSWORD = 'Admin@12345';
process.env.UPLOAD_DIR = require('node:os').tmpdir() + '/bsc-test-storage';
