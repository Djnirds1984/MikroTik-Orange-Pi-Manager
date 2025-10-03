# MikroTik Orange Pi Manager

A modern, responsive web dashboard for managing your MikroTik routers, specifically designed to be lightweight enough to run on an Orange Pi or similar single-board computer. It features a real-time monitoring dashboard and a powerful AI Script Assistant powered by the Google Gemini API.

![Screenshot of the MikroTik Orange Pi Manager Dashboard](./screenshot.png) <!-- Assuming a screenshot will be added later -->

## Features

-   **Multi-Router Support:** Add, edit, and switch between multiple router configurations seamlessly.
-   **Real-time Dashboard:** Connects to your selected router to monitor system information, resource usage (CPU/Memory), and live interface traffic with dynamic graphs.
-   **Live Data:** Fetches all data directly from your router via a secure, stateless backend proxy.
-   **Hotspot Client List:** See currently connected hotspot clients at a glance.
-   **AI Script Assistant:** Describe a networking task in plain English (e.g., "Block Facebook for the guest network"), and the AI will generate the corresponding RouterOS terminal script.
-   **Updater (Simulated):** Check for new versions of the management panel from a GitHub repository.
-   **Responsive Design:** A clean, modern UI that works on both desktop and mobile browsers.

## Technical Architecture

This project is a **unified Node.js application**. The backend, located in the `/proxy` directory, is an Express.js server that performs two roles:

1.  **API Proxy:** It exposes API endpoints (e.g., `/api/system-info`) that the frontend calls. When it receives a request, it securely connects to the target MikroTik router using the REST API, fetches the data, and returns it to the frontend.
2.  **Web Server:** It serves all the static frontend files (HTML, CSS, JavaScript) that make up the user interface.

This unified model simplifies development and deployment, as there's only one process to manage.

### Tech Stack

-   **Frontend:** React 19, TypeScript, Tailwind CSS, Recharts
-   **Backend:** Node.js, Express.js, Axios
-   **AI:** Google Gemini API (`@google/genai`)

---

## Running Locally for Development

Running the application on your local machine is now incredibly simple.

### **Prerequisites**
- **Node.js**: Ensure you have Node.js v20.x or later installed.
- **(Optional) Gemini API Key**: For the "AI Script" feature to work, you need a Google Gemini API key.
    1.  Get your key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    2.  Open the `env.js` file in the project's root directory.
    3.  Replace `"YOUR_GEMINI_API_KEY_HERE"` with your actual key.

### **Installation and Startup**
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Djnirds1984/MikroTik-Orange-Pi-Manager.git
   cd MikroTik-Orange-Pi-Manager
   ```
2. **Navigate to the proxy directory and install dependencies:**
   ```bash
   cd proxy
   npm install
   ```
3. **Start the server:**
   ```bash
   npm start
   ```
   You should see a message like `MikroTik Manager server running. Access it at http://localhost:3001`.

4. **Access the application:**
   Open your web browser and navigate to `http://localhost:3001`. That's it!

---

## Deployment on Orange Pi One (Step-by-Step Guide)

This guide shows how to deploy the application in a robust, production-ready manner on your Orange Pi using `pm2` (a process manager) and `nginx` (as a reverse proxy).

### **Prerequisites**

-   An Orange Pi One (or similar SBC) connected to your network.
-   An SD card with a fresh installation of Armbian or Debian.
-   You can connect to your Orange Pi via SSH.

### **Step 1: MikroTik Router Configuration**

For **each router** you want to manage, enable the REST API service.

1.  Log in to your MikroTik router (using WinBox or the web interface).
2.  Go to **IP -> Services**.
3.  Find the service named `www` and ensure it is **enabled**. Note the port number (default is `80`).
4.  (Highly Recommended) Create a dedicated, read-only user for the API. Go to **System -> Users**, click 'Add New', give it a name (e.g., `api-user`), assign it to the `read` group, and set a strong password.

### **Step 2: Prepare the Orange Pi**

Install the necessary software: Git, Node.js, `pm2`, and `nginx`.

1.  **Connect via SSH and Update System:**
    ```bash
    ssh your_user@your_orangepi_ip
    sudo apt update && sudo apt upgrade -y
    ```
    
2.  **Install Git:**
    ```bash
    sudo apt install -y git
    ```

3.  **Install Node.js (v20.x):**
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    ```

4.  **Install PM2 Process Manager:**
    ```bash
    sudo npm install pm2 -g
    ```

5.  **Install Nginx Web Server:**
    ```bash
    sudo apt install -y nginx
    ```

### **Step 3: Clone and Run the Application**

1.  **Navigate to the Project Directory:**
    Your project should be located at `/var/www/html/MikroTik-Orange-Pi-Manager`.
    ```bash
    cd /var/www/html/MikroTik-Orange-Pi-Manager
    ```

2.  **Navigate into the `proxy` Directory:**
    ```bash
    cd proxy
    ```
   
3.  **Install Dependencies:**
    ```bash
    npm install
    ```

4.  **(Optional) Configure the AI Assistant:**
    -   Edit the `env.js` file in the parent directory (`../env.js`).
        ```bash
        nano ../env.js
        ```
    -   Replace `"YOUR_GEMINI_API_KEY_HERE"` with your Gemini API key. Save and exit.

5.  **Start the Server with PM2:**
    We will use the standard name `mikrotik-manager` to identify this process in `pm2`.
    ```bash
    pm2 start server.js --name "mikrotik-manager"
    ```

6.  **Enable PM2 to Start on Boot:**
    ```bash
    pm2 startup
    # It will give you a command to copy/paste. Run it.
    pm2 save
    ```
    Your application is now running persistently on port 3001.

### **Step 4: Configure Nginx as a Reverse Proxy**

We will set up Nginx to forward all traffic from the standard web port (80) to our running application on port 3001.

1.  **Create a new Nginx configuration file:**
    ```bash
    sudo nano /etc/nginx/sites-available/mikrotik-manager
    ```
2.  **Paste the following configuration.** This tells Nginx to act as a reverse proxy.
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
3.  **Enable the new site and restart Nginx:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/mikrotik-manager /etc/nginx/sites-enabled/
    sudo rm /etc/nginx/sites-enabled/default # Remove the default Nginx page
    sudo nginx -t # Test the configuration
    sudo systemctl restart nginx
    ```

### **Step 5: Access Your Application!**

You are all set! Open a web browser and navigate to the IP address of your Orange Pi (e.g., `http://192.168.1.50`). You should see the MikroTik Manager interface.

---

## Updating the Application

The panel includes a one-click updater to fetch the latest version directly from your GitHub repository.

### **Requirement: Configure SSH for Git**

The one-click updater **requires** that your Orange Pi is configured to use an SSH key for authenticating with GitHub. The application will check the Git remote URL and will refuse to run the update process over an insecure HTTPS connection that could hang waiting for a password. Using an SSH key is secure and the only supported method for the updater.

This is a **one-time setup**.

**1. Generate an SSH Key on your Orange Pi:**
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Press Enter at each prompt to accept defaults
   ```

**2. Display and Copy your Public Key:**
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

**3. Add the SSH Key to your GitHub Account:**
   - Go to [github.com/settings/keys](https://github.com/settings/keys) and click "**New SSH key**".
   - Give it a title (e.g., "Orange Pi") and paste the key.

**4. Update your Git Remote URL on the Orange Pi:**
   - Navigate to your project directory: `cd /var/www/html/MikroTik-Orange-Pi-Manager`
   - Change the remote URL. **Replace `Djnirds1984/MikroTik-Orange-Pi-Manager` with your GitHub username/repo.**
     ```bash
     git remote set-url origin git@github.com:Djnirds1984/MikroTik-Orange-Pi-Manager.git
     ```
Now `git pull` will be passwordless and use SSH.

### **Pulling the Latest Code**

1.  **SSH into your Orange Pi.**

2.  **Navigate to the project directory:**
    ```bash
    cd /var/www/html/MikroTik-Orange-Pi-Manager
    ```

3.  **Pull the latest changes from GitHub:**
    ```bash
    git pull
    ```

4.  **Update backend dependencies (if any) and restart the app:**
    ```bash
    cd proxy
    npm install
    pm2 restart mikrotik-manager
    ```

5.  **Hard-refresh your browser** (`Ctrl+Shift+R` or `Cmd+Shift+R`) to load the new version.

---

## Manual Recovery (Emergency Restore)

If the web panel becomes inaccessible after a failed update, you can manually restore a backup directly from the command line on your Orange Pi.

**1. Connect via SSH and Stop the Application:**
   ```bash
   ssh your_user@your_orangepi_ip
   cd /var/www/html/MikroTik-Orange-Pi-Manager
   pm2 stop mikrotik-manager
   ```

**2. Find Your Backup File:**
   List the available backups to find the one you want to restore.
   ```bash
   ls -l backups/
   # Note the filename, for example: backup-2023-10-26T14-30-00.000Z.tar.gz
   ```

**3. Clear Old Files and Extract the Backup:**
   This step removes the broken application files and replaces them with the contents of your backup.

   ```bash
   # IMPORTANT: The next command deletes current application files.
   # It is designed to PRESERVE your '.git' and 'backups' directories.
   find . -maxdepth 1 -mindepth 1 ! -name 'backups' ! -name '.git' -exec rm -rf {} +

   # Now, extract your chosen backup into the current directory.
   # Replace YOUR_BACKUP_FILE.tar.gz with the actual filename from step 2.
   tar -xzf backups/YOUR_BACKUP_FILE.tar.gz -C .
   ```

**4. Re-install Dependencies and Restart:**
   Finally, install the correct node modules for the restored version and restart the server with pm2.
   ```bash
   cd proxy
   npm install
   cd ..
   pm2 restart mikrotik-manager
   ```
Your application should now be restored and accessible again.

## Disclaimer

-   This project is not affiliated with MikroTik or Orange Pi.
-   The AI-generated scripts are for assistance only. **Always review scripts carefully before running them on a production router.**
-   The "Updater" feature is a simulation. It does not perform a real file system upgrade.