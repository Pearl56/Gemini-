const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const usersDatabase = []; 
const onlineUsers = {}; 
const chatHistory = []; 

// 🟢 1. เส้นทางที่หน้าบ้านยิงมาตอนกด Sign up
app.post('/api/signup-auth', (req, res) => {
    const { email, firstname, lastname, phone, student_id, grade, room_no, password } = req.body;
    
    if (!email || !password) return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });

    let existingUser = usersDatabase.find(u => u.email === email);
    if (existingUser) return res.status(400).json({ error: "อีเมลนี้เคยลงทะเบียนในระบบแล้ว" });

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    
    const newUser = { 
        email, firstname, lastname, phone, student_id, grade, room_no, password,
        lastLoginAt: new Date(), ipAddress, status: "offline" 
    };
    usersDatabase.push(newUser);
    
    console.log(`✨ [สมัครใหม่สำเร็จ]: บัญชี ${email} บันทึกรหัสผ่านเรียบร้อย`);
    res.status(200).json({ message: "ลงทะเบียนสำเร็จ" });
});

// 🟢 2. เส้นทางที่หน้าบ้านยิงมาตอนกด Log in
app.post('/api/login-auth', (req, res) => {
    const { identifier, password } = req.body;

    let user = usersDatabase.find(u => u.email === identifier || u.phone === identifier);
    if (!user) return res.status(400).json({ error: "ไม่พบข้อมูลบัญชีผู้ใช้งานนี้ในระบบ" });
    if (user.password !== password) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง" });

    user.lastLoginAt = new Date();
    user.ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    console.log(`🔓 [เข้าสู่ระบบสำเร็จ]: บัญชี ${user.email} ล็อกอินเข้าใช้งานแล้ว`);
    res.status(200).json({ message: "ล็อกอินผ่านสำเร็จ", user });
});

app.get('/api/users', (req, res) => {
    const updatedUsers = usersDatabase.map(user => ({
        ...user,
        status: onlineUsers[user.email] ? "online" : "offline"
    }));
    res.status(200).json(updatedUsers);
});

app.get('/api/chats/:email', (req, res) => {
    const { email } = req.params;
    const history = chatHistory.filter(c => c.sender === email || c.receiver === email);
    res.status(200).json(history);
});

io.on('connection', (socket) => {
    socket.on('register_user', (email) => {
        onlineUsers[email] = socket.id;
        io.emit('system_update_users', {});
    });

    socket.on('send_private_message', (data) => {
        const { sender, receiver, message } = data;
        const messagePayload = { sender, receiver, message, timestamp: new Date() };
        chatHistory.push(messagePayload);
        const receiverSocketId = onlineUsers[receiver];
        if (receiverSocketId) io.to(receiverSocketId).emit('receive_private_message', messagePayload);
    });

    socket.on('disconnect', () => {
        for (let email in onlineUsers) {
            if (onlineUsers[email] === socket.id) {
                delete onlineUsers[email];
                io.emit('system_update_users', {});
                break;
            }
        }
    });
});
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ตั้งค่าที่เก็บรูปภาพ (สร้างโฟลเดอร์ uploads อัตโนมัติถ้ายังไม่มี)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        // ตั้งชื่อไฟล์ตามเวลา เช่น cam-1718293821.jpg (เลียนแบบ ESP32-CAM)
        cb(null, `cam-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// 🟢 API รอรับรูปภาพจากโทรศัพท์ (หรือจาก ESP32-CAM ในอนาคต)
app.post('/api/upload-image', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพ" });
    }
    console.log(`📸 [กล้องส่งภาพเข้า]: บันทึกไฟล์สำเร็จ -> ${req.file.filename}`);
    
    // ส่งสัญญาณไปบอกหน้าบอร์ดหลัก (หรือหน้าแอดมิน) ว่ามีภาพใหม่เข้ามาแล้วแบบ Real-time
    io.emit('new_image_arrival', { filename: req.file.filename, url: `/uploads/${req.file.filename}` });

    res.status(200).json({ message: "เซิร์ฟเวอร์ได้รับรูปภาพเรียบร้อยแล้ว", filename: req.file.filename });
});

// เปิดให้หน้าเว็บอื่นสามารถดึงรูปภาพในโฟลเดอร์ uploads ไปแสดงผลได้
app.use('/uploads', express.static(uploadDir));

server.listen(3000, () => {
    // 🟢 ข้อความแจ้งเตือนเวอร์ชันล่าสุด ต้องขึ้นประโยคนี้ใน Terminal ครับ
    console.log('🚀 เซิร์ฟเวอร์ระบบ LogIn/SignUp แบบแยกความปลอดภัย รันที่พอร์ต 3000');
});