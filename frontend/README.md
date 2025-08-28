# Parents Monolithic Frontend

This project is an admin panel for sending notifications to parents mobile phone.
## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)

## Overview

In this application you can send messages to parents and receive forms from the parents. Also You can manage students, groups, parents, admins through this Admin Panel.

## Features

- Sending a notification to parent.
- Dark and Light mode support.
- Authentication.
- Multi Language Support.

## Tech Stack

- **Next.js 14** - React Framework
- **React Query** - Data Fetching Library
- **NextAuth.js** - Authentication
- Next-Intl - Localization
- Shadcn - For UI

## Installation

1. Install dependencies:

    ```bash
    npm install
    ```
2. Create .env.example file and rename it to .env.local.
  
      ```bash
      cp .env.example .env.local
      ```

3. To create a secret key type this in the terminal:
  
    ```bash
    npm exec auth secret
    ```

## Usage

1. Run the development server:
  
    ```bash
    npm run dev
    ```

2. Happy coding!

