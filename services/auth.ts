import API from '@/lib/api';
import { clearTokens, setTokens } from '@/lib/auth-storage';

export type SignupPayload = {
  email: string;
  password: string;
  username?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyAddress?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type VerifyEmailPayload = {
  email: string;
  verificationCode: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  password: string;
};

export type ResetPasswordCodePayload = {
  email: string;
  code: string;
  password: string;
};

export type AuthUser = {
  _id: string;
  email: string;
  username?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyAddress?: string;
  isVerified?: boolean;
  isReportApprover?: boolean;
  authProvider?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const AuthService = {
  async signup(payload: SignupPayload): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/signup', payload);
    return data;
  },

  async login(payload: LoginPayload): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    try {
      const { data } = await API.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
        '/auth/login',
        payload,
      );
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message || err?.message || 'Failed to login';
      throw new Error(serverMsg);
    }
  },

  async verifyEmail(payload: VerifyEmailPayload): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/verify-email', payload);
    return data;
  },

  async resendVerificationCode(email: string): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/resend-verification-code', { email });
    return data;
  },

  async forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>('/auth/forgot-password', {
      ...payload,
      clientType: 'mobile',
    });
    return data;
  },

  async resetPasswordByCode(payload: ResetPasswordCodePayload): Promise<{ message: string; accessToken?: string; refreshToken?: string }> {
    const { data } = await API.post<{ message: string; accessToken?: string; refreshToken?: string }>(
      '/auth/reset-password-code',
      payload,
    );
    if (data.accessToken && data.refreshToken) {
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    }
    return data;
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<{ message: string; accessToken?: string; refreshToken?: string }> {
    const { data } = await API.post<{ message: string; accessToken?: string; refreshToken?: string }>(
      `/auth/reset-password/${payload.token}`,
      { password: payload.password },
    );
    if (data.accessToken && data.refreshToken) {
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    }
    return data;
  },

  async logout() {
    try {
      const { getRefreshToken } = await import('@/lib/auth-storage');
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await API.post('/auth/logout', { token: refreshToken }).catch(() => {});
      }
    } finally {
      clearTokens();
    }
  },
};
