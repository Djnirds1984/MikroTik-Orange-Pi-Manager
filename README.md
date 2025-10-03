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

To improve stability and reliability, this project now uses a **two-process architecture**, managed by a single `ecosystem.config.js` file for `pm2`.

1.  **Frontend UI Server (`mikrotik-manager`):** This is a lightweight Node.js/Express server. Its *only* job is to serve the static frontend files (HTML, CSS, JavaScript) that make up the user interface. It runs on port **3001**.
2.  **API Backend Server (`mikrotik-api-backend`):** This is a separate, dedicated Node.js/Express server that uses the official **MikroTik REST API**. It handles all communication with your routers and exposes API endpoints (e.g., `/api/system-info`) that the frontend calls. This separation means that if an API request fails, it will not crash the user interface. It runs on port **3002**.

This two-process model provides a robust separation of concerns, ensuring the application remains stable.

### Tech Stack

-   **Frontend:** React 19, TypeScript, Tailwind CSS, Recharts
-   **Backend:** Node.js, Express.js, Axios (for MikroTik REST API)
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
This new method uses an `ecosystem.config.js` file to manage both servers with a single command.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Djnirds1984/MikroTik-Orange-Pi-Manager.git
   cd MikroTik-Orange-Pi-Manager
   ```

2. **Install Dependencies for Both Servers:**
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

3. **Start the Application with PM2:**
   ```bash
   pm2 start ecosystem.config.js
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

This guide shows how to deploy both servers using `pm2` and the new `ecosystem.config.js` for simpler, more reliable process management.

### **Prerequisites**

-   An Orange Pi One (or similar SBC) with Armbian/Debian and SSH access.
-   Node.js v20+, Git, and PM2 installed.

### **Step 1: MikroTik Router Configuration**

You must enable the **REST API** on your router. In the terminal, run:
```routeros
/ip service enable www
# OR for HTTPS (recommended)
/ip service enable www-ssl
```
The default port for `www` is 80 and for `www-ssl` is 443. Ensure you use the correct port when adding the router in the panel. It is also recommended to create a dedicated user group with appropriate permissions for the API user.

### **Step 2: Clone and Prepare the Application**

1.  **Navigate to the Project Directory:**
    Your project should be located at `/var/www/html/MikroTik-Orange-Pi-Manager`.
    ```bash
    cd /var/w