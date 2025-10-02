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

This project consists of two main parts: a frontend web application and a backend proxy server.

1.  **Frontend (This Application):** A static web application built with React and TypeScript. It provides the user interface where you configure and manage your routers. Router details are stored in your browser's local storage.

2.  **Backend Proxy (`/proxy` directory):** A simple, **stateless** Node.js server that you run on your Orange Pi. It acts as a secure bridge between the frontend and your routers. It receives requests from the frontend (including the credentials for the target router) and makes the API connection on its behalf.

This separation is necessary because web browsers, for security reasons, cannot make the type of direct network connection required to talk to the MikroTik API.

### Tech Stack

-   **Frontend:** React 19, TypeScript, Tailwind CSS, Recharts
-   **Backend:** Node.js, Express.js, `node-routeros`
-   **AI:** Google Gemini API (`@google/genai`)

---

## Deployment on Orange Pi One (Step-by-Step Guide)

This guide will walk you through deploying the entire application on your Orange Pi One using a Git-based workflow.

### **Prerequisites**

-   An Orange Pi One (or similar SBC) with a power supply.
-   An SD card with a fresh installation of Armbian or Debian.
-   You can connect to your Orange Pi via SSH.

### **Step 1: MikroTik Router Configuration**

For **each router** you want to manage, you need to enable the API service.

1.  Log in to your MikroTik router (using WinBox or the web interface).
2.  Go to **IP -> Services**.
3.  Find the service named `api`. Make sure it is **enabled**. Note the port number (default is `8728`).
4.  (Highly Recommended) Create a dedicated, read-only user for the API. Go to **System -> Users**:
    -   Click 'Add New'.
    -   Give it a username (e.g., `api-user`).
    -   Assign it to the `read` group.
    -   Set a strong password.

### **Step 2: Prepare the Orange Pi**

First, we need to install the necessary software: Git, Node.js, a process manager (`pm2`), and a web server (`nginx`).

1.  **Connect via SSH and Update System:**
    ```bash
    ssh your_user@your_orangepi_ip
    sudo apt update && sudo apt upgrade -y
    ```
    
2.  **Install Git:**
    ```bash
    sudo apt install -y git
    ```

3.  **Install Node.js:** The default version in `apt` can be old. We'll use the NodeSource repository for a modern version.
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    ```
    Verify the installation:
    ```bash
    node -v  # Should show v20.x.x
    npm -v   # Should show a recent version
    ```

4.  **Install PM2 Process Manager:** This will keep our backend proxy running, even after reboots.
    ```bash
    sudo npm install pm2 -g
    ```

5.  **Install Nginx Web Server:** This will serve our frontend application.
    ```bash
    sudo apt install -y nginx
    ```

### **Step 3: Clone and Configure the Project**

Now we'll download the project directly from your GitHub repository onto the Orange Pi.

1.  **Clone Your Repository:**
    ```bash
    # Run this from your home directory (~)
    git clone https://github.com/Djnirds1984/MikroTik-Orange-Pi-Manager.git
    ```

2.  **Navigate into the Project Directory:**
    ```bash
    cd MikroTik-Orange-Pi-Manager
    ```

3.  **(Optional) Configure the AI Assistant:**
    -   If you want to use the AI Script Generator, you need a Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   Edit the `env.js` file:
        ```bash
        nano env.js
        ```
    -   Replace `"YOUR_GEMINI_API_KEY_HERE"` with your actual key. Save the file (Ctrl+X, then Y, then Enter).

### **Step 4: Deploy the Backend Proxy**

1.  **Navigate into the `proxy` directory and install its dependencies:**
    ```bash
    cd proxy
    npm install
    ```

2.  **Start the server with PM2:**
    ```bash
    pm2 start server.js --name "mikrotik-proxy"
    ```

3.  **Enable PM2 to start on boot:**
    ```bash
    pm2 startup
    # Follow the on-screen instructions (it will give you a command to copy/paste)
    pm2 save
    ```
    Your backend is now running and will restart automatically.

### **Step 5: Deploy the Frontend Application**

1.  **Configure Nginx:**
    -   Create a new Nginx configuration file.
        ```bash
        sudo nano /etc/nginx/sites-available/mikrotik-manager
        ```
    -   Paste the following configuration into the file:
        ```nginx
        server {
            listen 80 default_server;
            listen [::]:80 default_server;

            root /var/www/mikrotik-manager;
            index index.html;

            server_name _;

            location / {
                # This is the key for single-page applications like React
                try_files $uri /index.html;
            }
        }
        ```
    -   Save the file (Ctrl+X, then Y, then Enter).

2.  **Move the frontend files to the web server directory:**
    -   First, navigate back to the root of your project directory:
        ```bash
        cd ~/MikroTik-Orange-Pi-Manager
        ```
    -   Create the web directory and sync the files using `rsync`:
        ```bash
        sudo mkdir -p /var/www/mikrotik-manager
        sudo rsync -a --delete ./ /var/www/mikrotik-manager/ --exclude 'proxy' --exclude '.git' --exclude 'README.md'
        ```

3.  **Enable the new site and restart Nginx:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/mikrotik-manager /etc/nginx/sites-enabled/
    sudo rm /etc/nginx/sites-enabled/default # Remove the default config
    sudo nginx -t # Test the configuration
    sudo systemctl restart nginx
    ```

### **Step 6: Access Your Application!**

You are all set!

1.  Open a web browser on a device on the same network as your Orange Pi.
2.  Navigate to the IP address of your Orange Pi (e.g., `http://192.168.1.50`).
3.  You should see the MikroTik Manager interface.
4.  Go to the **Routers** page and add the connection details for your MikroTik devices.

---

## Updating the Application

When you push new changes to your GitHub repository, you can easily update the application on your Orange Pi.

1.  **Connect to your Orange Pi via SSH.**

2.  **Navigate to the project directory:**
    ```bash
    cd ~/MikroTik-Orange-Pi-Manager
    ```

3.  **Pull the latest changes from GitHub:**
    ```bash
    git pull origin main
    ```

4.  **Update backend dependencies and restart the proxy:**
    ```bash
    cd proxy
    npm install # In case dependencies have changed
    pm2 restart mikrotik-proxy
    cd ..
    ```

5.  **Re-sync the frontend files to the web directory:**
    ```bash
    sudo rsync -a --delete ./ /var/www/mikrotik-manager/ --exclude 'proxy' --exclude '.git' --exclude 'README.md'
    ```

6.  **Hard-refresh your browser** (`Ctrl+Shift+R` or `Cmd+Shift+R`) to see the changes.

## Disclaimer

-   This project is not affiliated with MikroTik or Orange Pi.
-   The AI-generated scripts are for assistance only. **Always review scripts carefully before running them on a production router.**
-   The "Updater" feature is a simulation. It does not perform a real file system upgrade.