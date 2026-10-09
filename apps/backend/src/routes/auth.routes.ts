import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import * as authService from '@/services/auth.service.js';
import { InvalidCredentialsError } from '@/services/auth.service.js';
import { NotificationService } from '@/services/notification.service.js';
import { authenticateJWT } from '@/middleware/auth.js';
import { authLimiter } from '@/middleware/rateLimit.js';
import { config } from '@/config/env.js';
import logger from '@/utils/logger.js';

const router = Router();
const notificationService = new NotificationService();

// 8 characters minimum — 6 is below every current password guideline, and
// this endpoint is public.
const passwordSchema = Joi.string().min(8).max(128).required();

const signupSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: passwordSchema,
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().max(128).required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: passwordSchema,
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(128).required(),
  newPassword: passwordSchema,
});

// Every credential-facing route is rate limited; brute force protection can't
// depend on an nginx config that isn't in the request path on most hosts.
router.post('/signup', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const result = await authService.signup(value.email, value.password);
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message === 'Email already registered') {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const result = await authService.login(value.email, value.password);
    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof InvalidCredentialsError) {
      // Identical response for "no such user" and "wrong password".
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    next(err);
  }
});

router.post('/refresh', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = refreshSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    // Returns a rotated refresh token alongside the new access token.
    const result = await authService.refreshAccessToken(value.refreshToken);
    res.status(200).json(result);
  } catch (err: any) {
    if (err.message === 'Invalid refresh token') {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/** Logout — revokes the presented refresh token so it can't be replayed. */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { value } = refreshSchema.validate(req.body);
    if (value?.refreshToken) {
      await authService.revokeRefreshToken(value.refreshToken);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const result = await authService.createPasswordResetToken(value.email);

    if (result) {
      const resetUrl = `${config.appScheme}://reset-password?token=${result.token}`;
      const sent = await notificationService.sendPasswordResetEmail(value.email, resetUrl);
      if (!sent) {
        logger.error('Password reset email could not be sent', { userId: result.userId });
      }
    }

    // Always 202, whether or not the address exists — otherwise this endpoint
    // becomes an account enumeration oracle.
    res.status(202).json({ message: 'If that email has an account, a reset link is on its way' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    await authService.resetPassword(value.token, value.password);
    res.status(200).json({ message: 'Password updated — sign in with your new password' });
  } catch (err: any) {
    if (err.message === 'Invalid or expired reset token') {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.post('/change-password', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    await authService.changePassword(req.user!.id, value.currentPassword, value.newPassword);
    res.status(200).json({ message: 'Password changed — sign in again on your other devices' });
  } catch (err: any) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
    next(err);
  }
});

router.get('/me', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

/**
 * Account deletion. Apple requires an in-app path to delete an account for any
 * app that offers signup — without this the build is rejected at review.
 * Trackers, devices, alerts and tokens all cascade from users.id.
 */
router.delete('/me', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.deleteAccount(req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
