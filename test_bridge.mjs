import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pythonBridgeService } from './backend/src/services/tampering/pythonBridge.service.js';

const p1Path = path.resolve('AI/image_tampering/upload/p1.png');
const p1Bytes = fs.readFileSync(p1Path);

console.log('Testing pythonBridgeService on p1.png...');
pythonBridgeService.analyzeFileBuffer(p1Bytes, 'p1.png')
  .then((res) => {
    console.log('Bridge Result Success:', res.success);
    console.log('Tampered:', res.tampered);
    console.log('Score:', res.score);
    console.log('Risk Level:', res.risk_level);
    console.log('Signals keys:', Object.keys(res.signals));
  })
  .catch((err) => {
    console.error('Bridge Test Error:', err);
  });
