// src/services/tampering/pythonBridge.service.js
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import logger from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PythonBridgeService {
  constructor() {
    this.cliScriptPath = path.resolve(__dirname, '../../../../AI/image_tampering/forensic/cli.py');
  }

  /**
   * Resolves the Python executable path using virtual environment precedence.
   */
  resolvePythonExecutable() {
    // 1. Explicit environment variable
    if (env.IMAGE_TAMPERING_PYTHON && fs.existsSync(env.IMAGE_TAMPERING_PYTHON)) {
      return env.IMAGE_TAMPERING_PYTHON;
    }
    if (process.env.IMAGE_TAMPERING_PYTHON && fs.existsSync(process.env.IMAGE_TAMPERING_PYTHON)) {
      return process.env.IMAGE_TAMPERING_PYTHON;
    }

    // 2. Project virtualenv paths (Windows / Unix)
    const isWindows = process.platform === 'win32';
    const candidatePaths = [
      // Virtualenv inside image_tampering
      path.resolve(__dirname, `../../../../AI/image_tampering/venv/${isWindows ? 'Scripts/python.exe' : 'bin/python'}`),
      // Virtualenv inside AI root
      path.resolve(__dirname, `../../../../AI/.venv/${isWindows ? 'Scripts/python.exe' : 'bin/python'}`),
      path.resolve(__dirname, `../../../../AI/venv/${isWindows ? 'Scripts/python.exe' : 'bin/python'}`),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // 3. Fallback to system python
    return isWindows ? 'python.exe' : 'python3';
  }

  /**
   * Executes the Python forensic pipeline on a binary buffer via CLI bridge.
   * 
   * @param {Buffer} fileBuffer - Document binary content
   * @param {string} originalFilename - Original filename with extension
   * @param {Object} options - Optional settings (saveDebug, debugDir, timeoutMs)
   * @returns {Promise<Object>} Structured Forensic Analysis Result
   */
  async analyzeFileBuffer(fileBuffer, originalFilename = 'document.png', options = {}) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw AppError.badRequest('Uploaded document file buffer is empty');
    }

    const pythonExe = this.resolvePythonExecutable();
    if (!fs.existsSync(this.cliScriptPath)) {
      logger.error(`Python forensic CLI script not found at ${this.cliScriptPath}`);
      throw AppError.internalServerError('Forensic detection bridge script is missing');
    }

    // Determine extension safely
    const ext = path.extname(originalFilename).toLowerCase() || '.png';
    const uniqueName = `tamper_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const tempFilePath = path.join(os.tmpdir(), uniqueName);
    const timeoutMs = options.timeoutMs || 120000; // 2 minutes

    // 1. Write buffer to secure temporary file
    await fs.promises.writeFile(tempFilePath, fileBuffer);

    // Also persist a copy to the single AI/upload/ folder
    try {
      const uploadDir = path.resolve(__dirname, '../../../../AI/upload');
      if (!fs.existsSync(uploadDir)) {
        await fs.promises.mkdir(uploadDir, { recursive: true });
      }
      const targetUploadPath = path.join(uploadDir, originalFilename);
      await fs.promises.writeFile(targetUploadPath, fileBuffer);
    } catch (uploadSaveErr) {
      logger.warn(`Could not save copy to AI/upload: ${uploadSaveErr.message}`);
    }

    const args = [
      this.cliScriptPath,
      '--input', tempFilePath,
      '--filename', originalFilename,
    ];

    if (options.saveDebug) {
      args.push('--save-debug');
    }
    if (options.debugDir) {
      args.push('--debug-dir', options.debugDir);
    }

    const startTime = Date.now();
    logger.info(`[ForensicBridge] Spawning Python forensic pipeline for "${originalFilename}" (${fileBuffer.length} bytes) using ${pythonExe}`);

    try {
      const result = await new Promise((resolve, reject) => {
        const proc = spawn(pythonExe, args, {
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
          },
        });

        let stdoutData = '';
        let stderrData = '';
        let isTimedOut = false;

        const timer = setTimeout(() => {
          isTimedOut = true;
          proc.kill('SIGTERM');
          reject(AppError.gatewayTimeout('Forensic analysis took too long to complete.'));
        }, timeoutMs);

        proc.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString('utf8');
        });

        proc.stderr.on('data', (chunk) => {
          stderrData += chunk.toString('utf8');
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          logger.error(`[ForensicBridge] Subprocess spawn error: ${err.message}`);
          reject(AppError.internalServerError(`Failed to start forensic engine: ${err.message}`));
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          if (isTimedOut) return;

          const durationMs = Date.now() - startTime;
          logger.info(`[ForensicBridge] Process finished with exit code ${code} in ${durationMs}ms`);

          if (stderrData.trim()) {
            logger.warn(`[ForensicBridge-stderr]:\n${stderrData.trim()}`);
          }

          if (code !== 0) {
            // Check if stdout has structured error JSON
            try {
              const errObj = JSON.parse(stdoutData.trim());
              if (errObj && errObj.error) {
                return reject(new AppError(
                  errObj.error.message || 'Forensic analysis failed',
                  code === 1 ? 400 : 500,
                  errObj.error.code || 'FORENSIC_ENGINE_ERROR'
                ));
              }
            } catch (_) {
              // Not JSON
            }

            return reject(AppError.internalServerError(
              `Forensic analysis could not be completed (code ${code}).`
            ));
          }

          // Parse stdout JSON
          try {
            const parsed = JSON.parse(stdoutData.trim());
            resolve(parsed);
          } catch (parseErr) {
            logger.error(`[ForensicBridge] JSON parse failed: ${parseErr.message}\nRaw stdout: ${stdoutData.slice(0, 500)}`);
            reject(AppError.internalServerError('Failed to parse forensic engine output.'));
          }
        });
      });

      return result;
    } finally {
      // 2. Ensure temporary file is cleaned up
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch (cleanupErr) {
        logger.warn(`[ForensicBridge] Failed to delete temp file ${tempFilePath}: ${cleanupErr.message}`);
      }
    }
  }
}

export const pythonBridgeService = new PythonBridgeService();
