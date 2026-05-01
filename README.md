# 📌 Team Task Manager
A Full-Stack Team Task Management System built using Node.js and SQLite that allows teams to manage projects, assign tasks, and collaborate efficiently with secure authentication.

# live link : https://tranquil-luck-production-6a8e.up.railway.app/signup 

# 🚀 Features
🔐 User Authentication (JWT-based)

Register & Login

Secure password hashing using bcrypt

Role-based access (Admin / Member)

# 👥 User Management

Admin can view all users

Role-based authorization

# 📁 Project Management

Create and manage projects

Add members to projects

Assign roles within projects

# ✅ Task Management

Create, update, delete tasks

Assign tasks to users

Track status (Pending, In-Progress, Completed)

Set priority (Low, Medium, High)

Due date tracking

# 📊 Dashboard

Task statistics (Total, Completed, Pending)

# 🛠️ Tech Stack
Backend: Node.js, Express.js

Database: SQLite

Authentication: JSON Web Tokens (JWT)

Security: bcryptjs

Middleware: CORS, Body-parser

From your project dependencies:

package


# 📂 Project Structure

team-task-manager/
│── server.js           # Main backend server
│── package.json        # Dependencies & scripts
│── taskmanager.db      # SQLite database
│── public/             # Static frontend (if any)
⚙️ Installation & Setup
1️⃣ Clone the Repository
Bash

git clone <your-repo-link>
cd team-task-manager
2️⃣ Install Dependencies
Bash

npm install
3️⃣ Run the Server
Bash

npm start
Server runs on:


# 👤 Users
GET /api/users → Get all users (Admin only)

# 📁 Projects
POST /api/projects → Create project

GET /api/projects → Get projects

GET /api/projects/:id → Project details

POST /api/projects/:id/members → Add member

# ✅ Tasks
POST /api/tasks → Create task

GET /api/tasks → Get tasks

PUT /api/tasks/:id → Update task

DELETE /api/tasks/:id → Delete task

# 📊 Dashboard
GET /api/dashboard → Task statistics

# 🗄️ Database Schema
Users Table
id, name, email, password, role

# Projects Table
id, name, description, owner_id

# Project Members
project_id, user_id, role

# Tasks Table
id, project_id, title, description

# status, priority, assigned_to

due_date

Defined in backend:

server


# 📌 Key Highlights (For Interview)
Implemented role-based access control

Designed relational database schema (SQLite)

Used JWT authentication for stateless security

Built RESTful APIs using Express.js

Implemented middleware for authentication & authorization

Structured project for scalability and maintainability

# 📄 License
This project is for educational purposes.

# 👨‍💻 Author
Mohd Adnan
