# MikroTik Orange Pi Manager

A modern, responsive web dashboard for managing your MikroTik routers, specifically designed to be lightweight enough to run on an Orange Pi or similar single-board computer. It features a real-time monitoring dashboard and a powerful AI Script Assistant powered by the Google Gemini API.

![Screenshot of the MikroTik Orange Pi Manager Dashboard](./screenshot.png) <!-- Assuming a screenshot will be added later -->

## Features

-   **Multi-Router Support:** Add, edit, and switch between multiple router configurations seamlessly.
-   **Real-time Dashboard:** Connects to your selected router to monitor system information, resource usage (CPU/Memory), and live interface traffic with dynamic graphs.
-   **AI Script Assistant:** Describe a networking task in plain English (e.g., "Block Facebook for the guest network"), and the AI will generate the corresponding RouterOS terminal script.
-   **PPPoE Management:** Full CRUD management for PPPoE profiles and users (secrets).
-   **Billing System:** Create billing plans and process payments for PPPoE users, with automated scheduler integration for managing expired accounts.
-   **ZeroTier Management:** Join, leave, enable, and disable ZeroTier networks directly from the UI.
-   **Updater:** A one-click updater to fetch the latest version of the panel from your GitHub repository, including automatic backups and rollback functionality.
-   **Responsive Design:** A clean, modern UI that works on both desktop and mobile browsers.

## Technical Architecture

To improve stability and reliability, this project uses a **two-process architecture**.

1.  **Frontend UI Server (`mikrotik-manager`):** This is a lightweight Node.js/Express server. Its *only* job is to serve the static frontend files (HTML, CSS, JavaScript) that make up the user interface. It runs on port **3001**.
2.  **API Backend Server (`mikrotik-api-backend`):** This is a separate, dedicated Node.js/Express server that uses the official **MikroTik REST API**. It handles all communication with your routers and exposes API endpoints (e.g., `/api/system-info`) that the frontend calls. This separation means that if an API request fails, it will not crash the user interface. It runs on port **3002**.

This two-process model provides a robust separation of concerns, ensuring the application remains stable.

### Tech Stack

-   **Frontend:** React 19, TypeScript, Tailwind CSS, Recharts
-   **Backend:** Node.js, Express.js, Axios (for MikroTik REST API)
-   **Database:** SQLite (`@vscode/sqlite3`)
-   **AI:** Google Gemini API (`@google/genai`)

---

## Running Locally for Development

### **Prerequisites**
- **Node.js**: Ensure you have Node.js v20.x or later installed.
- **PM2**: `npm install -g pm2`
- **(Optional) Gemini API Key**: For the "AI Script" feature to work, you need a Google Gemini API key.
    1.  Get your key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    2.  Open the `env.js` file and replace `"YOUR_GEMINI_API_KEY_HERE"` with your actual key.

### **Installation and Startup**
This new, more reliable method starts each server as a separate, named process.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Djnirds1984/MikroTik-Orange-Pi-Manager.git
   cd MikroTik-Orange-Pi-Manager
   ```

2. **Install Dependencies for Both Servers:**
   ```bash
   # Install for UI Server
   npm install --prefix proxy
   
   # Install for API Backend Server
   npm install --prefix api-backend
   ```

3. **Start the Application with PM2:**
   **IMPORTANT: Ensure you are in the project's root directory (`MikroTik-Orange-Pi-Manager`) before running these commands.**
   ```bash
   # First, stop and delete any old running processes to ensure a clean start
   pm2 delete all
   
   # Start the UI server on port 3001
   pm2 start ./proxy/server.js --name mikrotik-manager

   # Start the API backend server on port 3002
   pm2 start ./api-backend/server.js --name mikrotik-api-backend
   ```

4. **Check the status:**
   ```bash
   pm2 list
   # You should see both 'mikrotik-manager' and 'mikrotik-api-backend' online.
   ```
   
5. **Access the application:**
   Open your web browser and navigate to **`http://localhost:3001`**. The UI served from port 3001 will automatically communicate with the backend on port 3002.

---

## Deployment on Orange Pi One (Step-by-Step Guide)

This guide shows how to deploy both servers using simple `pm2` commands for reliable process management.

### **Prerequisites**

-   An Orange Pi One (or similar SBC) with Armbian/Debian and SSH access.
-   Node.js v20+, Git, and PM2 installed.
-   **Build Tools:** The application has dependencies that may need to be compiled from source. Ensure you have the necessary build tools installed:
    ```bash
    sudo apt-get update
    sudo apt-get install -y build-essential
    ```

### **Step 1: MikroTik Router Configuration**

-   **Enable REST API:** You must enable the **REST API** on your router. In the terminal, run:
    ```routeros
    /ip service enable www
    # OR for HTTPS (recommended)
    /ip service enable www-ssl
    ```
    The default port for `www` is 80 and for `www-ssl` is 443. Ensure you use the correct port when adding the router in the panel. It is also recommended to create a dedicated user group with appropriate permissions for the API user.

-   **Enable ZeroTier Package (Optional):** For the ZeroTier Management feature to work, ensure the `zerotier` package is installed and enabled on your router.
    ```routeros
    /zerotier set enabled=yes
    ```

### **Step 2: Prepare the Application**

1.  **Navigate to the Project Directory:**
    Your project should be located at `/var/www/html/MikroTik-Orange-Pi-Manager`.
    ```bash
    cd /var/www/html/MikroTik-Orange-Pi-Manager
    ```

2.  **Install/Update Dependencies:**
    Run these commands to ensure all necessary packages for both servers are installed.
    ```bash
    npm install --prefix proxy
    npm install --prefix api-backend
    ```

### **Step 3: Start and Manage the Application with PM2**

1.  **Stop and Delete Old Processes (CRITICAL STEP):**
    Before starting, always clear out any old or lingering processes to prevent conflicts.
    ```bash
    pm2 delete all
    ```

2.  **Start Both Servers:**
    **IMPORTANT: Ensure you are in the project's root directory (`/var/www/html/MikroTik-Orange-Pi-Manager`) before running these commands.**
    ```bash
    # Start the UI server on port 3001
    pm2 start ./proxy/server.js --name mikrotik-manager

    # Start the API backend server on port 3002
    pm2 start ./api-backend/server.js --name mikrotik-api-backend
    ```

3.  **Verify the Status:**
    Check that both processes (`mikrotik-manager` and `mikrotik-api-backend`) are online and running without errors.
    ```bash
    pm2 list
    ```

4.  **Save the Process List:**
    This command saves the current process list. If the server reboots, `pm2` will automatically restart your applications.
    ```bash
    pm2 save
    ```

5.  **Viewing Logs:**
    To see the logs for both servers in real-time:
    ```bash
    pm2 logs
    ```

### **Step 4: Access the Panel**
Open your browser and navigate to `http://<your_orange_pi_ip>:3001`.

---

## Troubleshooting

### API Requests are Failing

If you can see the UI but data from the router isn't loading, it's likely an issue with the API backend server.

-   **Check the logs:** Run `pm2 logs mikrotik-api-backend`. Look for connection errors or crashes.
-   **Verify Router Config:** In the "Routers" page, double-check that the IP address, username, password, and **port** for your router are correct. The default port for HTTP is 80 and HTTPS is 443.
-   **Firewall:** Ensure your router's firewall is not blocking access to the REST API port from the Orange Pi's IP address.

### AI Features Not Working

If you get an error about an "Invalid API Key", ensure you have correctly pasted your Google Gemini API key into the `env.js` file and have saved the changes. You may need to restart the `mikrotik-manager` process (`pm2 restart mikrotik-manager`) for the change to take effect.