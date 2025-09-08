// routes/uploads.js
import express from 'express';
import { signUpload, destroyImage } from '../services/cloudinary.js';

const router = express.Router();

// Gera assinatura para upload assinado (frontend usa antes de enviar p/ Cloudinary)
router.post('/signature', (req, res) => {
  try {
    const { public_id, folder } = req.body || {};
    const sig = signUpload({ public_id, folder });
    res.json(sig);
  } catch {
    res.status(500).json({ message: 'Erro ao assinar upload' });
  }
});

// Destrói uma imagem manualmente (para testes/manutenção)
// ⚠️ Em produção, proteja com authRequired/adminOnly.
router.delete('/destroy', async (req, res) => {
  try {
    const { public_id } = req.body || {};
    if (!public_id) return res.status(400).json({ message: 'public_id obrigatório' });
    await destroyImage(public_id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Erro ao destruir imagem' });
  }
});

export default router;
