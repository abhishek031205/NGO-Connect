const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

/* =========================
   MONGODB CONNECTION
========================= */

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
  });

/* =========================
   USER MODEL
========================= */

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      default: "admin",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

/* =========================
   VOLUNTEER MODEL
========================= */

const volunteerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    skills: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

const Volunteer = mongoose.model("Volunteer", volunteerSchema);

/* =========================
   DONATION MODEL
========================= */

const donationSchema = new mongoose.Schema(
  {
    donorName: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    purpose: {
      type: String,
      default: "General",
      trim: true,
    },

    paymentMethod: {
      type: String,
      default: "Other",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Donation = mongoose.model("Donation", donationSchema);

/* =========================
   AUTH MIDDLEWARE
========================= */

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Invalid authentication token",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(403).json({
      message: "Invalid or expired token",
    });
  }
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "NGO Connect backend is running",
  });
});

/* =========================
   REGISTER FIRST ADMIN
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters",
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "admin",
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      message: "Unable to create admin",
      error: error.message,
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Unable to login",
      error: error.message,
    });
  }
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Unable to get user",
    });
  }
});

/* =========================
   DASHBOARD
========================= */

app.get("/api/dashboard", authenticateToken, async (req, res) => {
  try {
    const volunteerCount = await Volunteer.countDocuments();
    const donationCount = await Donation.countDocuments();

    const donationResult = await Donation.aggregate([
      {
        $group: {
          _id: null,
          total: {
            $sum: "$amount",
          },
        },
      },
    ]);

    const totalDonations =
      donationResult.length > 0 ? donationResult[0].total : 0;

    res.json({
      success: true,
      stats: {
        volunteers: volunteerCount,
        donors: donationCount,
        donations: totalDonations,
        projects: 0,
        beneficiaries: 0,
        events: 0,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      message: "Unable to load dashboard",
      error: error.message,
    });
  }
});

/* =========================
   VOLUNTEERS - GET
========================= */

app.get("/api/volunteers", authenticateToken, async (req, res) => {
  try {
    const volunteers = await Volunteer.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      volunteers,
    });
  } catch (error) {
    console.error("Get volunteers error:", error);

    res.status(500).json({
      message: "Unable to load volunteers",
    });
  }
});

/* =========================
   VOLUNTEERS - CREATE
========================= */

app.post("/api/volunteers", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      skills,
      status,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required",
      });
    }

    const volunteer = await Volunteer.create({
      name,
      email,
      phone: phone || "",
      skills: skills || "",
      status: status || "Active",
    });

    res.status(201).json({
      success: true,
      message: "Volunteer added successfully",
      volunteer,
    });
  } catch (error) {
    console.error("Create volunteer error:", error);

    res.status(500).json({
      message: "Unable to add volunteer",
      error: error.message,
    });
  }
});

/* =========================
   VOLUNTEERS - DELETE
========================= */

app.delete(
  "/api/volunteers/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const volunteer = await Volunteer.findByIdAndDelete(
        req.params.id
      );

      if (!volunteer) {
        return res.status(404).json({
          message: "Volunteer not found",
        });
      }

      res.json({
        success: true,
        message: "Volunteer deleted successfully",
      });
    } catch (error) {
      console.error("Delete volunteer error:", error);

      res.status(500).json({
        message: "Unable to delete volunteer",
      });
    }
  }
);

/* =========================
   DONATIONS - GET
========================= */

app.get("/api/donations", authenticateToken, async (req, res) => {
  try {
    const donations = await Donation.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      donations,
    });
  } catch (error) {
    console.error("Get donations error:", error);

    res.status(500).json({
      message: "Unable to load donations",
    });
  }
});

/* =========================
   DONATIONS - CREATE
========================= */

app.post("/api/donations", authenticateToken, async (req, res) => {
  try {
    const {
      donorName,
      amount,
      purpose,
      paymentMethod,
    } = req.body;

    if (!donorName || amount === undefined) {
      return res.status(400).json({
        message: "Donor name and amount are required",
      });
    }

    const donation = await Donation.create({
      donorName,
      amount: Number(amount),
      purpose: purpose || "General",
      paymentMethod: paymentMethod || "Other",
    });

    res.status(201).json({
      success: true,
      message: "Donation added successfully",
      donation,
    });
  } catch (error) {
    console.error("Create donation error:", error);

    res.status(500).json({
      message: "Unable to add donation",
      error: error.message,
    });
  }
});

/* =========================
   AI ASSISTANT
========================= */

let ai = null;

if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
}

app.post("/api/ai/chat", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        message: "Please enter a message",
      });
    }

    if (!ai) {
      return res.status(500).json({
        message: "Gemini API key is not configured",
      });
    }

    const [
      volunteerCount,
      donationCount,
      donationResult,
      recentVolunteers,
      recentDonations,
    ] = await Promise.all([
      Volunteer.countDocuments(),
      Donation.countDocuments(),

      Donation.aggregate([
        {
          $group: {
            _id: null,
            total: {
              $sum: "$amount",
            },
          },
        },
      ]),

      Volunteer.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("name email phone skills status"),

      Donation.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("donorName amount purpose paymentMethod createdAt"),
    ]);

    const totalDonations =
      donationResult.length > 0 ? donationResult[0].total : 0;

    const ngoData = {
      volunteers: {
        total: volunteerCount,
        recent: recentVolunteers,
      },

      donations: {
        totalRecords: donationCount,
        totalAmount: totalDonations,
        recent: recentDonations,
      },
    };

    const systemInstruction = `
You are the AI assistant for NGO Connect, an NGO Management System.

Your job is to help the NGO administrator understand and use the information available in the system.

IMPORTANT RULES:

1. Never invent NGO data.
2. Only use the NGO data provided to you.
3. If the available data does not answer the question, clearly say that the required information is not available.
4. Do not expose passwords, API keys, JWT tokens, database credentials, or other secrets.
5. Do not claim that you changed, deleted, added, or modified database records.
6. You are an assistant and should provide information, explanations, summaries, calculations, and recommendations.
7. Keep answers concise and easy to understand.
8. Use bullet points or short sections when useful.
9. For calculations, calculate carefully using the provided data.
10. If the administrator asks about volunteers or donations, use the supplied current database information.

Current NGO Connect data:

${JSON.stringify(ngoData, null, 2)}
`;

    const response = await ai.models.generateContent({
      model:"gemini-3.8-flash",
      contents: message,
      config: {
        systemInstruction,
      },
    });

    const answer =
      response.text ||
      "I could not generate a response right now.";

    res.json({
      success: true,
      response: answer,
    });
  } catch (error) {
    console.error("AI error:", error);

    res.status(500).json({
      message: "AI assistant is temporarily unavailable",
      error: error.message,
    });
  }
});

/* =========================
   FRONTEND FALLBACK
========================= */

app.use((req, res, next) => {
  if (req.method !== "GET") {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      message: "API endpoint not found",
    });
  }

  res.sendFile(path.join(frontendPath, "index.html"));
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    message: "Internal server error",
  });
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`NGO Connect server running on http://localhost:${PORT}`);
});