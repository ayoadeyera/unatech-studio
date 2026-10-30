
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration
const UPLOAD_ROOT = path.join(__dirname, "uploads", "narrations");
const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100 MB
const VISUAL_UPLOAD_ROOT = path.join(
  __dirname,
  "uploads",
  "visuals"
);

const MAX_VISUAL_SIZE = 100 * 1024 * 1024;

fs.mkdirSync(VISUAL_UPLOAD_ROOT, {
  recursive: true,
});
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json());

// Supported narration formats
const allowedTypes = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
};
// Supported visual media formats
const allowedVisualTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
};
// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const projectId = req.params.projectId;
    const projectDirectory = path.join(UPLOAD_ROOT, projectId);

    fs.mkdirSync(projectDirectory, { recursive: true });
    callback(null, projectDirectory);
  },

  filename: (req, file, callback) => {
    const extension = allowedTypes[file.mimetype];
    const filename = `${crypto.randomUUID()}${extension}`;

    callback(null, filename);
  },
});

// Audio upload middleware
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const expectedExtension = allowedTypes[file.mimetype];

    if (
      !expectedExtension ||
      extension !== expectedExtension
    ) {
      return callback(
        new Error("Only MP3 and WAV narration files are supported.")
      );
    }

    callback(null, true);
  },
});

// Visual media storage
const visualStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    const { projectId } = req.params;

    const projectDirectory = path.join(
      VISUAL_UPLOAD_ROOT,
      projectId
    );

    fs.mkdirSync(projectDirectory, {
      recursive: true,
    });

    callback(null, projectDirectory);
  },

  filename: (req, file, callback) => {
    const extension = allowedVisualTypes[file.mimetype];

    callback(
      null,
      `${crypto.randomUUID()}${extension}`
    );
  },
});

// Visual media upload middleware
const uploadVisual = multer({
  storage: visualStorage,

  limits: {
    fileSize: MAX_VISUAL_SIZE,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const expectedExtension =
      allowedVisualTypes[file.mimetype];

    const validExtension =
      expectedExtension === extension ||
      (expectedExtension === ".jpg" &&
        extension === ".jpeg");

    if (!expectedExtension || !validExtension) {
      return callback(
        new Error(
          "Only JPG, PNG, WebP and MP4 files are supported."
        )
      );
    }

    callback(null, true);
  },
});

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "UnaTech Studio API is running!",
    application: "UnaTech Studio",
    version: "1.0.0",
  });
});

// API welcome
app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to UnaTech Studio API",
    status: "online",
  });
});

// Validate project IDs before using them in filesystem paths
app.param("projectId", (req, res, next, projectId) => {
  if (
    typeof projectId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid project ID.",
    });
  }

  next();
});

// Upload narration
app.post(
  "/api/projects/:projectId/narration",
  (req, res, next) => {
    upload.single("audio")(req, res, (error) => {
      if (error) return next(error);
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an audio file.",
      });
    }

    const { projectId } = req.params;

    const audioUrl =
      `/api/projects/${projectId}/narrations/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: "Narration uploaded successfully.",
      narration: {
        id: path.parse(req.file.filename).name,
        projectId,
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
        url: audioUrl,
      },
    });
  }
);

// Retrieve uploaded narration
app.get(
  "/api/projects/:projectId/narrations/:filename",
  (req, res) => {
    const { projectId, filename } = req.params;

    if (!/^[0-9a-f-]{36}\.(mp3|wav)$/i.test(filename)) {
      return res.status(400).json({
        success: false,
        message: "Invalid narration filename.",
      });
    }

    const filePath = path.join(UPLOAD_ROOT, projectId, filename);

    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(error.status || 404).json({
          success: false,
          message: "Narration file not found.",
        });
      }
    });
  }
);

// Upload visual media
app.post(
  "/api/projects/:projectId/visuals",
  uploadVisual.single("visual"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a visual media file.",
      });
    }

    const { projectId } = req.params;

    const mediaUrl =
      `/api/projects/${projectId}/visuals/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: "Visual media uploaded successfully.",
      media: {
        id: path.parse(req.file.filename).name,
        projectId,
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
        mediaType: req.file.mimetype.startsWith("image/")
          ? "image"
          : "video",
        url: mediaUrl,
      },
    });
  }
);

// Retrieve uploaded visual media
app.get(
  "/api/projects/:projectId/visuals/:filename",
  (req, res) => {
    const { projectId, filename } = req.params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/i.test(filename)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid visual media filename.",
      });
    }

    const filePath = path.join(
      VISUAL_UPLOAD_ROOT,
      projectId,
      filename
    );

    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(error.status || 404).json({
          success: false,
          message: "Visual media file not found.",
        });
      }
    });
  }
);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Audio file exceeds the 100 MB limit."
          : error.message,
    });
  }

  console.error("UnaTech Studio API error:", error.message);

  res.status(400).json({
    success: false,
    message: error.message || "An unexpected error occurred.",
  });
});

// Start backend
app.listen(PORT, () => {
  console.log(
    `UnaTech Studio server running at http://localhost:${PORT}`
  );
});
