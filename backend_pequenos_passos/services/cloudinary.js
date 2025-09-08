// services/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = process.env;

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key:    CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// Gera assinatura para upload assinado (usado pelo frontend)
export function signUpload({ public_id, folder, timestamp = Math.floor(Date.now() / 1000) }) {
  const paramsToSign = { timestamp };
  if (folder) paramsToSign.folder = folder;
  if (public_id) paramsToSign.public_id = public_id;

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    CLOUDINARY_API_SECRET
  );

  return {
    timestamp,
    signature,
    folder,
    api_key: CLOUDINARY_API_KEY,
    cloud_name: CLOUDINARY_CLOUD_NAME,
    public_id,
  };
}

// Remove uma imagem do Cloudinary (pode aceitar opções, ex.: { resource_type: 'video' })
export async function destroyImage(public_id, opts = {}) {
  if (!public_id) throw new Error('public_id vazio');
  // por padrão, recurso é imagem; para vídeo use: { resource_type: 'video' }
  return cloudinary.uploader.destroy(public_id, {
    resource_type: 'image',
    invalidate: true,
    ...opts,
  });
}

export default cloudinary;
