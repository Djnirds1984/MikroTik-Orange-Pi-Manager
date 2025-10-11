# Testing Guide for MikroTik Orange Pi Manager

This guide provides instructions on how to test the various components of the application to ensure they are working correctly after the final build.

## Prerequisites

1.  **Application is Running:** Both the UI server (`mikrotik-manager` on port 3001) and the API backend (`mikrotik-api-backend` on port 3002) must be running. See `README.md` for startup instructions.
2.  **MikroTik Router Access:** You need at least one MikroTik router accessible from the API backend server.
3.  **Router REST API Enabled:** The router must have the REST API service enabled. In the MikroTik terminal, run `/ip service enable www` (for HTTP) or `/ip service enable www-ssl` (for HTTPS). Note the port you are using.
4.  **Gemini API Key:** For the "AI Scripting" feature, a valid Google Gemini API key must be configured in the `env.js` file.

---

## 1. Core Functionality Testing

### 1.1. Router Management (`/routers` page)

-   **Test Adding a Router:**
    1.  Navigate to the "Routers" page.
    2.  Click "Add New Router".
    3.  Fill in the details for your MikroTik router (name, host, user, password, and the correct REST API port).
    4.  Click "Test Connection". **Expected Result:** A green message appears stating "Connection successful!".
    5.  Click "Save Router". **Expected Result:** The new router appears in the list.
-   **Test Editing a Router:**
    1.  Click the "Edit" icon next to the router.
    2.  Change the "Router Name".
    3.  Click "Save Router". **Expected Result:** The name is updated in the list.
-   **Test Deleting a Router:**
    1.  Click the "Delete" icon next to a router.
    2.  Confirm the deletion. **Expected Result:** The router is removed from the list.

### 1.2. Dashboard (`/dashboard` page)

-   **Test Data Loading:**
    1.  Select your configured router from the dropdown in the top bar.
    2.  **Expected Result:** The dashboard loads without a "Failed to load router data" error. The "System Information" and "Resource Usage" cards show realistic data.
-   **Test Live Traffic:**
    1.  Observe the "Interface Traffic" table. The small graphs should be updating every few seconds.
    2.  Generate traffic through your router (e.g., run a speed test).
    3.  **Expected Result:** The RX/TX rates and the graph for the relevant interface reflect the increased traffic.

### 1.3. AI Scripting (`/scripting` page)

-   **Test Script Generation:**
    1.  Navigate to the "AI Scripting" page.
    2.  Enter a prompt, e.g., `Create a firewall rule to drop all input to port 22`.
    3.  Click "Generate Script". **Expected Result:** A valid RouterOS script appears in the code block.
-   **Test Copy Functionality:**
    1.  Click the "Copy" icon on the code block.
    2.  **Expected Result:** The icon changes to a checkmark. Paste into a text editor to confirm the script was copied.

---

## 2. ZeroTier Management (`/zerotier` page)

### Prerequisite
- Ensure the `zerotier` package is installed and enabled on your MikroTik router. Run `/zerotier set enabled=yes` in the terminal.

-   **Test Joining a Network:**
    1.  Navigate to the "ZeroTier" page.
    2.  Click "Join Network".
    3.  Enter a valid 16-digit ZeroTier Network ID.
    4.  Click "Join Network". **Expected Result:** The new network appears in the list after a brief delay. The status might be `REQUESTING_CONFIGURATION` initially, then change to `OK`.
-   **Test Disabling/Enabling:**
    1.  Click the toggle switch in the "Enabled" column for the network you just added.
    2.  **Expected Result:** The toggle switch changes state. On the router, the interface should now be disabled.
    3.  Click the toggle again. **Expected Result:** The interface is re-enabled.
-   **Test Leaving a Network:**
    1.  Click the "Delete" icon next to the network and confirm.
    2.  **Expected Result:** The ZeroTier interface is removed from the list.

---

## 3. PPPoE & Billing System Testing

### 3.1. PPPoE Profiles (`/pppoe` page)

-   **Test Adding a Profile:**
    1.  Navigate to the "PPPoE Profiles" page.
    2.  Click "Add New Profile".
    3.  Fill in the form (e.g., Name: `Test-10M`, Local Address: `10.0.0.1`, Remote Address: `your_ip_pool`, Rate Limit: `5M/10M`).
    4.  Click "Save Profile". **Expected Result:** The new profile appears in the list.
-   **Test Editing a Profile:**
    1.  Click the "Edit" icon on the `Test-10M` profile.
    2.  Change the Rate Limit to `10M/20M`.
    3.  Click "Save Profile". **Expected Result:** The rate limit for the profile is updated in the list.
-   **Test Deleting a Profile:**
    1.  Click the "Delete" icon on the `Test-10M` profile and confirm.
    2.  **Expected Result:** The profile is removed from the list.

### 3.2. Billing Plans (`/billing` page)

-   **Test Adding a Plan:**
    1.  Navigate to the "Billing Plans" page.
    2.  Click "Add New Plan".
    3.  Fill in the form, linking it to a PPPoE profile that exists on your router.
    4.  Click "Save Plan". **Expected Result:** The new plan appears in the list. (Note: This is saved in browser local storage).

### 3.3. PPPoE Users & Payments (`/users` page)

-   **Test Adding a User:**
    1.  Navigate to the "PPPoE Users" page.
    2.  Click "Add New User".
    3.  Enter a username and password.
    4.  Select a Billing Plan from the dropdown.
    5.  Click "Save User". **Expected Result:** The new user appears in the list with the correct profile and "No Info" for the subscription.
-   **Test Payment Processing:**
    1.  Click the "Pay" button for the new user.
    2.  The payment modal should appear.
    3.  Enter `2` in the "Discount for Downtime (Days)" field. **Expected Result:** The "Final Amount" updates to reflect the discount.
    4.  Select a "Profile on Expiry" (e.g., a "Non-Payment" profile).
    5.  Click "Confirm Payment".
    6.  **Expected Result:** The user's "Subscription" in the list updates to "Active" with a due date 30 days in the future.
-   **Verify on Router:**
    1.  Log into your MikroTik router via WinBox or terminal.
    2.  Go to `/system script`. **Expected Result:** A new script named `expire-[username]` exists.
    3.  Go to `/system scheduler`. **Expected Result:** A new scheduler named `expire-sched-[username]` exists with a `start-date` matching the user's new due date.

---

## 4. Updater Functionality Testing (`/updater` page)

### 4.1. Test Update Availability

1.  **Simulate a remote change:**
    -   On another machine (or on GitHub directly), commit and push a small change to your repository (e.g., add a line to this `TESTING.md` file).
2.  **Check Status in UI:**
    -   Navigate to the "Updater" page.
    -   Click "Check for Updates".
    -   **Expected Result:** The status changes to "An update is available" and the "Update Now" button appears.

### 4.2. Test the Update & Backup Process

1.  With an update available, click "**Update Now**".
2.  **Expected Result:** The update log appears, showing progress. The process should end with a restart message, and the page should automatically reload after ~10 seconds.
3.  After reloading, go back to the Updater page. **Expected Result:** A new backup file (`backup-....tar.gz`) is listed under "Available Backups".

### 4.3. Test the Rollback Process

1.  Click the "Restore" button next to the backup file you just created.
2.  Confirm the action.
3.  **Expected Result:** A rollback log appears. The server will restart, and the page will reload.
4.  After reloading, verify that the application has reverted to its previous state (i.e., the change you pushed in step 3.1.1 is gone).