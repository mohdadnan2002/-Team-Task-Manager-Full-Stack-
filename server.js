const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'team-task-manager-secret-key-2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup (use /tmp for Railway ephemeral filesystem)
const dbPath = process.env.RAILWAY ? '/tmp/taskmanager.db' : './taskmanager.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database error:', err.message);
    else console.log('Connected to SQLite database');
});

// Initialize Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        owner_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS project_members (
        project_id INTEGER,
        user_id INTEGER,
        role TEXT DEFAULT 'member',
        PRIMARY KEY (project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in-progress', 'completed')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
        assigned_to INTEGER,
        due_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (assigned_to) REFERENCES users(id)
    )`);
});

// Auth Middleware
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    jwt.verify(token.split(' ')[1], JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    });
};

// Admin Middleware
const requireAdmin = (req, res, next) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`, 
            [name, email, hashedPassword, role || 'member'],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: 'Registration failed' });
                }
                res.json({ message: 'User registered successfully', userId: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ 
            token, 
            user: { id: user.id, name: user.name, email: user.email, role: user.role } 
        });
    });
});

// Get Current User
app.get('/api/auth/me', authenticate, (req, res) => {
    db.get(`SELECT id, name, email, role FROM users WHERE id = ?`, [req.userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

// ============ USER ROUTES ============

// Get All Users (Admin only)
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
    db.all(`SELECT id, name, email, role FROM users`, [], (err, users) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch users' });
        res.json(users);
    });
});

// ============ PROJECT ROUTES ============

// Create Project
app.post('/api/projects', authenticate, (req, res) => {
    const { name, description } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Project name required' });

    db.run(`INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)`, 
        [name, description, req.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create project' });
            
            db.run(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'admin')`, 
                [this.lastID, req.userId],
                (err) => {
                    if (err) console.error('Member add error:', err);
                }
            );
            
            res.json({ message: 'Project created', projectId: this.lastID });
        }
    );
});

// Get My Projects
app.get('/api/projects', authenticate, (req, res) => {
    const query = req.userRole === 'admin' 
        ? `SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id`
        : `SELECT p.*, u.name as owner_name FROM projects p 
           JOIN users u ON p.owner_id = u.id
           JOIN project_members pm ON p.id = pm.project_id
           WHERE pm.user_id = ?`;
    
    const params = req.userRole === 'admin' ? [] : [req.userId];
    
    db.all(query, params, (err, projects) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch projects' });
        res.json(projects);
    });
});

// Get Project Details
app.get('/api/projects/:id', authenticate, (req, res) => {
    db.get(`SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?`, 
        [req.params.id], 
        (err, project) => {
            if (err || !project) return res.status(404).json({ error: 'Project not found' });
            
            db.all(`SELECT u.id, u.name, u.email, pm.role FROM project_members pm JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?`,
                [req.params.id],
                (err, members) => {
                    project.members = members;
                    res.json(project);
                }
            );
        }
    );
});

// Add Member to Project
app.post('/api/projects/:id/members', authenticate, (req, res) => {
    const { email, role } = req.body;
    
    db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        
        db.run(`INSERT OR REPLACE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
            [req.params.id, user.id, role || 'member'],
            (err) => {
                if (err) return res.status(500).json({ error: 'Failed to add member' });
                res.json({ message: 'Member added successfully' });
            }
        );
    });
});

// ============ TASK ROUTES ============

// Create Task
app.post('/api/tasks', authenticate, (req, res) => {
    const { project_id, title, description, priority, assigned_to, due_date } = req.body;
    
    if (!project_id || !title) {
        return res.status(400).json({ error: 'Project ID and title are required' });
    }

    db.run(`INSERT INTO tasks (project_id, title, description, priority, assigned_to, due_date) VALUES (?, ?, ?, ?, ?, ?)`,
        [project_id, title, description, priority || 'medium', assigned_to, due_date],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create task' });
            res.json({ message: 'Task created', taskId: this.lastID });
        }
    );
});

// Get Tasks (by project or all for user)
app.get('/api/tasks', authenticate, (req, res) => {
    const projectId = req.query.project_id;
    let query, params;
    
    if (projectId) {
        if (req.userRole === 'admin') {
            query = `SELECT t.*, u.name as assignee_name, p.name as project_name FROM tasks t 
                     LEFT JOIN users u ON t.assigned_to = u.id 
                     LEFT JOIN projects p ON t.project_id = p.id
                     WHERE t.project_id = ?`;
            params = [projectId];
        } else {
            query = `SELECT t.*, u.name as assignee_name, p.name as project_name FROM tasks t 
                     LEFT JOIN users u ON t.assigned_to = u.id 
                     LEFT JOIN projects p ON t.project_id = p.id
                     WHERE t.project_id = ? AND (t.assigned_to = ? OR p.owner_id = ?)`;
            params = [projectId, req.userId, req.userId];
        }
    } else {
        if (req.userRole === 'admin') {
            query = `SELECT t.*, u.name as assignee_name, p.name as project_name FROM tasks t 
                     LEFT JOIN users u ON t.assigned_to = u.id 
                     LEFT JOIN projects p ON t.project_id = p.id`;
            params = [];
        } else {
            query = `SELECT t.*, u.name as assignee_name, p.name as project_name FROM tasks t 
                     LEFT JOIN users u ON t.assigned_to = u.id 
                     LEFT JOIN projects p ON t.project_id = p.id
                     WHERE t.assigned_to = ? OR p.owner_id = ?`;
            params = [req.userId, req.userId];
        }
    }
    
    db.all(query, params, (err, tasks) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch tasks' });
        res.json(tasks);
    });
});

// Update Task Status
app.put('/api/tasks/:id', authenticate, (req, res) => {
    const { status, title, description, priority, assigned_to, due_date } = req.body;
    
    let updates = [];
    let values = [];
    
    if (status) { updates.push('status = ?'); values.push(status); }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description) { updates.push('description = ?'); values.push(description); }
    if (priority) { updates.push('priority = ?'); values.push(priority); }
    if (assigned_to) { updates.push('assigned_to = ?'); values.push(assigned_to); }
    if (due_date) { updates.push('due_date = ?'); values.push(due_date); }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.params.id);
    
    db.run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: 'Failed to update task' });
        res.json({ message: 'Task updated successfully' });
    });
});

// Delete Task
app.delete('/api/tasks/:id', authenticate, (req, res) => {
    db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to delete task' });
        res.json({ message: 'Task deleted' });
    });
});

// ============ DASHBOARD ROUTES ============

// Get Dashboard Stats
app.get('/api/dashboard', authenticate, (req, res) => {
    const userId = req.userId;
    const isAdmin = req.userRole === 'admin';
    
    let taskQuery, taskParams;
    
    if (isAdmin) {
        taskQuery = `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN due_date < date('now') AND status != 'completed' THEN 1 ELSE 0 END) as overdue
            FROM tasks`;
        taskParams = [];
    } else {
        taskQuery = `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN due_date < date('now') AND status != 'completed' THEN 1 ELSE 0 END) as overdue
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.assigned_to = ? OR p.owner_id = ?`;
        taskParams = [userId, userId];
    }
    
    db.get(taskQuery, taskParams, (err, stats) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch stats' });
        
        db.get(`SELECT COUNT(*) as total FROM projects`, [], (err, projectCount) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch projects' });
            
            db.get(`SELECT COUNT(*) as total FROM users`, [], (err, userCount) => {
                if (err) return res.status(500).json({ error: 'Failed to fetch users' });
                
                res.json({
                    tasks: stats,
                    projects: projectCount.total,
                    users: userCount.total
                });
            });
        });
    });
});

// Get Team Members (for assignment)
app.get('/api/team-members/:projectId', authenticate, (req, res) => {
    db.all(`SELECT u.id, u.name, u.email FROM users u 
            JOIN project_members pm ON u.id = pm.user_id 
            WHERE pm.project_id = ?`,
        [req.params.projectId],
        (err, members) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch members' });
            res.json(members);
        }
    );
});

// Serve Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
