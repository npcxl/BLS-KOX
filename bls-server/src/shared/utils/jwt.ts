import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { JwtPayload } from '../types/current-user';

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.jwt.expiresIn };
  return `Bearer ${jwt.sign(payload, env.jwt.secret, options)}`;
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwt.secret) as JwtPayload;
}

export function parseBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}
