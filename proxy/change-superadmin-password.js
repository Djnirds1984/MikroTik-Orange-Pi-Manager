const path = require('path');
const sqlite3 = require('@vscode/sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

const SUPERADMIN_DB_PATH = path.join(__dirname, 'superadmin.db');

async function changePassword() {
  const newPassword = process.argv[2];

  if (!newPassword) {
    console.error('\x1b[31mError: Please provide a new password.\x1b[0m');
    console.log('Usage: node proxy/change-superadmin-password.js <your-new-password>');
    process.exit(1);
  }

  if (newPassword.length < 4) {
    console.error('\x1b[31mError: Password should be at least 4 characters long.\x1b[0m');
    process.exit(1);
  }

  let db;
  try {
    db = await open({
      filename: SUPERADMIN_DB_PATH,
      driver: sqlite3.Database
    });

    console.log('Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    console.log('Updating superadmin password in the database...');
    const result = await db.run(
      'UPDATE superadmin SET password = ? WHERE username = ?',
      hashedPassword,
      'superadmin'
    );

    if (result.changes === 0) {
      console.error('\x1b[31mError: Superadmin user not found. Was the database initialized?\x1b[0m');
      process.exit(1);
    }

    console.log('\x1b[32mSuperadmin password has been successfully updated.\x1b[0m');

  } catch (err) {
    console.error('\x1b[31mAn error occurred:\x1b[0m', err.message);
    process.exit(1);
  } finally {
    if (db) {
      await db.close();
    }
  }
}

changePassword();
