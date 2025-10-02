# MikroTik Orange Pi Manager

A modern, responsive web dashboard for managing your MikroTik router, specifically designed to be lightweight enough to run on an Orange Pi or similar single-board computer. It features a real-time monitoring dashboard and a powerful AI Script Assistant powered by the Google Gemini API.

![Screenshot of the MikroTik Orange Pi Manager Dashboard](./screenshot.png) <!-- Assuming a screenshot will be added later -->

## Features

- **Real-time Dashboard:** Monitor system information, resource usage (CPU/Memory), and live interface traffic with dynamic graphs.
- **Hotspot Client List:** See currently connected hotspot clients at a glance.
- **AI Script Assistant:** Describe a networking task in plain English (e.g., "Block Facebook for the guest network"), and the AI will generate the corresponding RouterOS terminal script.
- **Updater (Simulated):** Check for new versions of the management panel from a GitHub repository.
- **Responsive Design:** A clean, modern UI that works on both desktop and mobile browsers.
- **Lightweight:** Built with modern tools, ready to be served from a low-power device like an Orange Pi.

## Technical Architecture

This project is a **frontend-only application** built with React and TypeScript. It is designed to be served as a static web page.

### Important: Backend Proxy Requirement

For security reasons, web browsers cannot connect directly to the MikroTik API (which uses a raw TCP socket). To fetch live data from your router, you **must** create a simple backend proxy.

**How it works:**

1.  The **Frontend** (this application) makes standard HTTP requests to the backend proxy (e.g., `GET /api/system-info`).
2.  The **Backend Proxy** (a small server you run on your Orange Pi) receives these requests.
3.  The proxy then connects to your MikroTik router's API, executes the necessary commands, and fetches the data.
4.  Finally, the proxy sends the data back to the frontend as a JSON response.

You can build this proxy with any language you prefer, such as Node.js (with a library like `ros-node`), Python (with `routeros_api`), or Go.

The `services/mikrotikService.ts` file in this project is currently using mock data but is structured to make switching to real API calls simple. You would just need to replace the promise-based mock functions with `fetch` calls to your proxy's endpoints.

## Tech Stack

- **Framework:** React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Charting:** Recharts
- **AI:** Google Gemini API (`@google/genai`)

## Setup and Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/mikrotik-orangepi-manager.git
cd mikrotik-orangepi-manager
```

### 2. Set up the AI Script Assistant

The AI Script Generator requires a Google Gemini API key.

1.  Obtain an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  Create a file named `.env` in the root of the project directory by copying the example file:
    ```bash
    cp .env.example .env
    ```
3.  Open the new `.env` file and add your API key:
    ```
    API_KEY=YOUR_GEMINI_API_KEY_HERE
    ```

**Note:** This project uses an environment variable `process.env.API_KEY` to load the key. For a static web app, this requires a build step (e.g., using Vite or Create React App) to replace the variable. When deploying, ensure this key is handled securely and not exposed publicly in your client-side code.

### 3. Running Locally

Since this is a simple static application, you can serve it with any local web server. If you have Node.js installed, you can use a simple package like `serve`.

1.  Install `serve`:
    ```bash
    npm install -g serve
    ```
2.  Run the server from the project's root directory:
    ```bash
    serve .
    ```
3.  Open your browser and navigate to the URL provided (usually `http://localhost:3000`).

### 4. Deployment on Orange Pi

1.  Set up a web server (like Nginx or Caddy) on your Orange Pi.
2.  Copy the contents of this repository to the web server's root directory (e.g., `/var/www/html`).
3.  (Optional) Set up your backend proxy on the same device.
4.  Access the dashboard from any device on your network by navigating to your Orange Pi's IP address.

## Disclaimer

- This project is not affiliated with MikroTik or Orange Pi.
- The AI-generated scripts are for assistance only. **Always review scripts carefully before running them on a production router.**
- The "Updater" feature is a simulation to demonstrate how such functionality would work. It does not perform a real file system upgrade.
