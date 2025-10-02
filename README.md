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

## Setup and Installation

### Prerequisites

-   Node.js and `npm` installed on your Orange Pi (or development machine).
-   A web server (like Nginx or Caddy) installed on your Orange Pi to serve the frontend files.

### Part 1: MikroTik Router Configuration

For **each router** you want to manage, you need to enable the API service.

1.  Log in to your MikroTik router (using WinBox or the web interface).
2.  Go to **IP -> Services**.
3.  Find the service named `api`. Make sure it is enabled. Note the port number (default is `8728`).
4.  It's highly recommended to create a dedicated user for the API with limited permissions. Go to **System -> Users**.
    -   Click 'Add New'.
    -   Give it a username (e.g., `api-user`).
    -   Assign it to the `read` group (this is sufficient for the dashboard).
    -   Set a strong password.

### Part 2: Backend Proxy Setup

The backend proxy is located in the `/proxy` directory. Its setup is very simple as it no longer stores router credentials.

1.  **Navigate to the proxy directory:**
    ```bash
    cd proxy
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure the Port (Optional):**
    -   If you want the proxy to run on a port other than the default `3001`, you can create a `.env` file in the `/proxy` directory and add:
        ```
        PORT=your_desired_port
        ```

4.  **Run the proxy server:**
    ```bash
    npm start
    ```
    The server will start. You can keep it running in the background using a tool like `pm2`.

### Part 3: Frontend Setup

1.  **Configure the AI Assistant (Optional):**
    -   The AI Script Generator requires a Google Gemini API key. If you want to use it, obtain a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   In the project's **root** directory, create a `.env` file by copying the example:
        ```bash
        cp .env.example .env
        ```
    -   Add your API key to this file.

2.  **Serve the Frontend:**
    -   The frontend consists of static files (`index.html`, etc.). You need to serve these from a web server.
    -   For local development, you can use a simple tool. From the project's **root** directory:
        ```bash
        # If you don't have it, install 'serve': npm install -g serve
        serve .
        ```
    -   For deployment on your Orange Pi, copy all the frontend files (everything **except** the `proxy` directory) to your web server's root (e.g., `/var/www/html`).

### Running the Application

1.  Start the backend proxy: `cd proxy && npm start`.
2.  Start your frontend web server.
3.  Open a web browser and navigate to the IP address of your Orange Pi.
4.  Go to the **Routers** page and add the connection details for your MikroTik devices.
5.  Use the dropdown in the header to select a router and view its dashboard.

## Disclaimer

-   This project is not affiliated with MikroTik or Orange Pi.
-   The AI-generated scripts are for assistance only. **Always review scripts carefully before running them on a production router.**
-   The "Updater" feature is a simulation. It does not perform a real file system upgrade.
