# Testing Guide for MikroTik Orange Pi Manager

This guide provides instructions on how to test the various components of the application to ensure they are working correctly.

## Prerequisites

1.  The application must be running (either locally or on your Orange Pi). See `README.md` for setup instructions.
2.  You need access to at least one MikroTik router with the REST API enabled.
3.  For AI Scripting tests, a valid Google Gemini API key must be configured in `env.js`.

---

## 1. Frontend & Core Functionality Testing

These tests should be performed in your web browser.

### 1.1. Router Management (`/routers` page)

-   **Test Adding a Router:**
    1.  Navigate to the "Routers" page.
    2.  Click "Add New Router".
    3.  Fill in the details for your MikroTik router.
    4.  Click "Test Connection". You should see a "Connection successful!" message.
    5.  Click "Save Router". The new router should appear in the list.
-   **Test Editing a Router:**
    1.  Click the "Edit" icon next to a router.
    2.  Change a non-critical detail, like the "Router Name".
    3.  Click "Save Router". The name should be updated in the list.
-   **Test Deleting a Router:**
    1.  Click the "Delete" icon next to a router.
    2.  Confirm the deletion. The router should be removed from the list.

### 1.2. Dashboard (`/dashboard` page)

-   **Test Data Loading:**
    1.  Select a configured router from the dropdown in the top bar.
    2.  The dashboard should load without a "Failed to load router data" error.
    3.  Verify that "System Information" and "Resource Usage" cards show realistic data (e.g., Uptime, Version, CPU Load).
-   **Test Live Traffic:**
    1.  Observe the "Interface Traffic" table.
    2.  The small graphs should be updating every few seconds.
    3.  Generate some traffic through an interface on your router (e.g., run a speed test from a connected device).
    4.  Verify that the RX/TX rates and the graph for that interface reflect the increased traffic.

### 1.3. AI Scripting (`/scripting` page)

-   **Test Script Generation:**
    1.  Navigate to the "AI Scripting" page.
    2.  Enter a prompt, e.g., `Create a firewall rule to drop all input to port 22`.
    3.  Click "Generate Script".
    4.  The AI should produce a valid RouterOS script in the code block on the right.
-   **Test Example Prompts:**
    1.  Click on one of the example buttons (e.g., "Basic Firewall").
    2.  The prompt area should be filled with the example text.
    3.  Click "Generate Script" and verify a script is generated.
-   **Test Copy Functionality:**
    1.  Click the "Copy" icon on the code block.
    2.  The icon should change to a checkmark.
    3.  Paste the content into a text editor to confirm the script was copied correctly.

---

## 2. Updater Functionality Testing (`/updater` page)

Testing the updater requires making changes to your local git repository to simulate updates being available.

### 2.0. Test SSH Configuration Requirement

This test verifies that the updater correctly blocks updates over insecure HTTPS remotes.

1.  **Set Git remote to HTTPS (for testing):**
    -   SSH into your device and navigate to the project directory.
    -   **Replace the URL with your repository's HTTPS URL.**
    -   `git remote set-url origin https://github.com/Djnirds1984/MikroTik-Orange-Pi-Manager.git`
2.  **Check for Error in UI:**
    -   Go to the "Updater" page in the web UI and click "Check for Updates".
    -   Verify that an error message appears, stating that the Git remote is not configured for SSH and showing the current HTTPS URL.
3.  **Restore Git remote to SSH:**
    -   In your SSH session, set the remote back to the correct SSH URL.
    -   `git remote set-url origin git@github.com:Djnirds1984/MikroTik-Orange-Pi-Manager.git`
4.  **Verify Functionality:**
    -   On the "Updater" page, click "Check for Updates" again.
    -   Verify that the check now proceeds without the SSH error.


### 2.1. Test "Check for Updates"

1.  **Ensure you are up-to-date:**
    -   SSH into your device.
    -   Navigate to the project directory: `cd /var/www/html/MikroTik-Orange-Pi-Manager`
    -   Run `git pull` to make sure your local repository is synced with the remote.
2.  **Check Status:**
    -   Go to the "Updater" page in the web UI.
    -   Click "Check for Updates".
    -   The status should change to "You are running the latest version."

### 2.2. Test Update Availability

1.  **Simulate a remote change:**
    -   On another machine (or on GitHub directly), commit and push a small change to your repository (e.g., add a comment to the `README.md`).
2.  **Check Status Again:**
    -   On the "Updater" page, click "Check for Updates".
    -   The status should now change to "A new version is available." and the "Upgrade Now" button should appear.

### 2.3. Test the Update Process

**Warning:** This will overwrite local files. Ensure you have no unsaved changes.

1.  With an update available (from the previous step), click the "**Upgrade Now**" button.
2.  An "Updating Log" section should appear, showing the output from `git pull` and `npm install`.
3.  The process should end with a "Restarting application" message.
4.  After about 10 seconds, the page should automatically reload.
5.  After reloading, verify that the change you made in step 2.2.1 is present in the application's files.

### 2.4. Test the Backup & Rollback Process

1.  **Verify Backup Creation:**
    -   After running a successful update (step 2.3), check the "Available Backups" list on the Updater page.
    -   A new backup file (`backup-....tar.gz`) should be listed.
    -   You can also verify this on the server in the `backups/` directory.
2.  **Test Rollback:**
    -   Click the "Restore" button next to a backup file.
    -   Confirm the action.
    -   The "Rollingback Log" should appear, showing files being restored.
    -   The server will restart, and the page will reload.
    -   After reloading, verify that the application has reverted to the state it was in when the backup was created (i.e., the update from step 2.3 is gone).