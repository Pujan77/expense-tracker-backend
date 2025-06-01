# Expense Tracker Deployment Guide

## Overview

This document provides instructions for deploying the Expense Tracker application to a production environment. The application is built using the MERN stack (MongoDB, Express, React, Node.js).

## Prerequisites

- Node.js (v14+)
- MongoDB database (local or cloud-based like MongoDB Atlas)
- NPM or Yarn package manager

1. **Set up environment variables**
   Create a `.env` file in the backend directory with the following variables:

   ```
   NODE_ENV=production
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   ```

2. **Install dependencies**

   ```
   cd backend
   npm install
   ```

3. **Start the server**
   ```
   npm start
   ```
