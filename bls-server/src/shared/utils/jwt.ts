import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { JwtPayload } from '../types/current-user';

export type TokenType = 'access' | 'refresh';

export type TokenPayload = JwtPayload & {
  jti: string;
  tokenType: TokenType;
};

function buildPayload(payload: JwtPayload, tokenType: TokenType): TokenPayload {
  return {
    ...payload,
    jti: randomUUID(),
    tokenType,
  };
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.jwt.expiresIn };
  return `Bearer ${jwt.sign(buildPayload(payload, 'access'), env.jwt.secret, options)}`;
}

export function signRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.jwt.refreshExpiresIn };
  return jwt.sign(buildPayload(payload, 'refresh'), env.jwt.secret, options);
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.jwt.secret) as TokenPayload;
  if (payload.tokenType !== 'access') throw new Error('invalid access token');
  return payload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.jwt.secret) as TokenPayload;
  if (payload.tokenType !== 'refresh') throw new Error('invalid refresh token');
  return payload;
}

export function parseBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}
