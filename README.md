# MikroTik Orange Pi Manager

A modern, responsive web dashboard for managing your MikroTik routers, specifically designed to be lightweight enough to run on an Orange Pi or similar single-board computer. It features a real-time monitoring dashboard and a powerful AI Script Assistant powered by the Google Gemini API.

![Screenshot of the MikroTik Orange Pi Manager Dashboard](./screenshot.png) <!-- Assuming a screenshot will be added later -->

## Features

-   **Multi-Router Support:** Add, edit, and switch between multiple router configurations seamlessly.
-   **Real-time Dashboard:** Connects to your selected router to monitor system information, resource usage (CPU/Memory), and live interface traffic with dynamic graphs.
-   **AI Script Assistant:** Describe a networking task in plain English (e.g., "Block Facebook for the guest network"), and the AI will generate the corresponding RouterOS terminal script.
-   **PPPoE Management:** Full CRUD management for PPPoE profiles and users (secrets).
-   **Billing System:** Create billing plans and process payments for PPPoE users, with automated scheduler integration for managing expired accounts.
-   **Updater:** A one-click updater to fetch the latest version of the panel from your GitHub repository, including automatic backups and rollback functionality.
-   **Responsive Design:** A clean, modern UI that works on both desktop and mobile browsers.

## Technical Architecture

To improve stability and reliability, this project now uses a **two-process architecture**.

1.  **Frontend UI Server (`/proxy`):** This is a lightweight Node.js/Express server. Its *only* job is to serve the static frontend files (HTML, CSS, JavaScript) that make up the user interface. It runs on port **3001**.
2.  **API Backend Server (`/api-backend`):** This is a separate, dedicated Node.js/Express server. It handles all communication with your MikroTik routers. It exposes API endpoints (e.g., `/api/system-info`) that the frontend calls. This separation means that if an API request fails, it will not crash the user interface. It runs on port **3002**.

This two-process model provides a robust separation of concerns, ensuring the application remains stable.

### Tech Stack

-   **Frontend:** React 19, TypeScript, Tailwind CSS, Recharts
-   **Backend:** Node.js, Express.js, `node-mikrotik-api`
-   **AI:** Google Gemini API (`@google/genai`)

---

## Running Locally for Development

### **Prerequisites**
- **Node.js**: Ensure you have Node.js v20.x or later installed.
- **(Optional) Gemini API Key**: For the "AI Script" feature to work, you need a Google Gemini API key.
    1.  Get your key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    2.  Open the `env.js` file and replace `"YOUR_GEMINI_API_KEY_HERE"` with your actual key.

### **Installation and Startup**
You will need two separate terminal windows to run both servers.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Djnirds1984/MikroTik-Orange-Pi-Manager.git
   cd MikroTik-Orange-Pi-Manager
   ```

2. **Terminal 1: Start the Frontend UI Server**
   ```bash
   cd proxy
   npm install
   npm start 
   # This will start the UI server on http://localhost:3001
   ```

3. **Terminal 2: Start the API Backend Server**
   ```bash
   # From the root project directory
   cd api-backend
   npm install
   npm start
   # This will start the API backend on http://localhost:3002
   ```

4. **Access the application:**
   Open your web browser and navigate to **`http://localhost:3001`**. The UI served from port 3001 will automatically communicate with the backend on port 3002.

---

## Deployment on Orange Pi One (Step-by-Step Guide)

This guide shows how to deploy both servers using `pm2` for process management.

### **Prerequisites**

-   An Orange Pi One (or similar SBC) with Armbian/Debian and SSH access.
-   Node.js v20+, Git, and PM2 installed. (See previous README versions for detailed setup).

### **Step 1: MikroTik Router Configuration**

Enable the REST API service (`www`) on each router you want to manage. It's highly recommended to create a dedicated read-only user for this purpose.

### **Step 2: Clone and Prepare the Application**

1.  **Navigate to the Project Directory:**
    Your project should be located at `/var/www/html/MikroTik-Orange-Pi-Manager`.
    ```bash
    cd /var/www/html/MikroTik-Orange-Pi-Manager
    ```

2.  **Install Dependencies for Both Servers:**
    ```bash
    # Install for UI Server
    cd proxy
    npm install
    cd ..
    
    # Install for API Backend Server
    cd api-backend
    npm install
    cd ..
    ```

3.  **(Optional) Configure the AI Assistant:**
    Edit `env.js` and add your Gemini API key.

### **Step 3: Start Both Servers with PM2**

1.  **Start the Frontend UI Server:**
    ```bash
    pm2 start proxy/server.js --name "mikrotik-manager"
    ```
    
2.  **Start the API Backend Server:**
    ```bash
    pm2 start api-backend/server.js --name "mikrotik-api-backend"
    ```

3.  **Check that both are running:**
    ```bash
    pm2 list
    # You should see both 'mikrotik-manager' and 'mikrotik-api-backend' online.
    ```

4.  **Enable PM2 to Start on Boot:**
    ```bash
    pm2 startup
    # It will give you a command to copy/paste. Run it.
    pm2 save
    ```
    Your application is now running persistently. The UI is on port 3001 and the API on port 3002.

### **Step 4: (Optional but Recommended) Configure Nginx as a Reverse Proxy**

If you want to access the UI on the standard port 80, you can use Nginx.

1.  **Create/Edit your Nginx config:** `sudo nano /etc/nginx/sites-available/mikrotik-manager`
2.  **Use the following configuration.** This forwards web traffic to the UI server on port 3001.
    ```nginx
    server {
        listen 80 default_server;
        server_name _;

        location / {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
3.  **Enable the site and restart Nginx:**
    ```bash
    # Ensure you've removed the default site link first
    sudo systemctl restart nginx
    ```
    You can now access the panel directly via your Orange Pi's IP address.

---

## Updating the Application

### **Requirement: Configure SSH for Git**

The one-click updater **requires** SSH key authentication with GitHub. See previous README versions for the one-time setup guide.

### **Using the Updater**

The built-in updater will now handle updating both servers. When you click "Update Now":
1.  A backup of the entire application is created.
2.  The latest code is pulled from Git.
3.  `npm install` is run in both the `proxy` and `api-backend` directories.
4.  `pm2` is instructed to restart both the `mikrotik-manager` and `mikrotik-api-backend` processes.

---

## Manual Recovery (Emergency Restore)

If the panel becomes inaccessible, you can restore a backup from the command line.

**1. SSH into your Orange Pi and Stop Both Processes:**
   ```bash
   pm2 stop mikrotik-manager
   pm2 stop mikrotik-api-backend
   ```

**2. Navigate to the project directory:** `cd /var/www/html/MikroTik-Orange-Pi-Manager`

**3. Find Your Backup File:** `ls -l backups/`

**4. Clear Old Files and Extract the Backup:**
   ```bash
   # This preserves your .git, backups, proxy, and api-backend directories
   find . -maxdepth 1 -mindepth 1 ! -name 'backups' ! -name '.git' ! -name 'proxy' ! -name 'api-backend' -exec rm -rf {} +

   # Extract your chosen backup. Replace YOUR_BACKUP_FILE.tar.gz
   tar -xzf backups/YOUR_BACKUP_FILE.tar.gz -C .
   ```

**5. Re-install Dependencies and Restart:**
   ```bash
   # Re-install for both servers
   cd proxy && npm install && cd ..
   cd api-backend && npm install && cd ..

   # Restart with pm2
   pm2 restart mikrotik-manager
   pm2 restart mikrotik-api-backend
   ```
Your application should now be restored.
