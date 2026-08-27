/**
 * Authentication API Service
 */

import apiClient, { handleApiResponse } from './client';
import type { ApiResponse } from '@/types/api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatar?: string;
    organizationId: string;
  };
  expiresAt: string;
}

export const authApi = {
  /**
   * Login
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', data);
    // response.data is already ApiResponse<T>, so we need to extract the data
    return handleApiResponse(response.data);
  },

  /**
   * Logout
   */
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  /**
   * Refresh token
   */
  refreshToken: async (refreshToken: string): Promise<{ token: string; expiresAt: string }> => {
    const response = await apiClient.post<ApiResponse<{ token: string; expiresAt: string }>>(
      '/auth/refresh',
      { refreshToken },
    );
    return handleApiResponse(response.data);
  },

  /**
   * Request password reset instructions
   */
  forgotPassword: async (
    data: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> => {
    const response = await apiClient.post<ApiResponse<ForgotPasswordResponse>>(
      '/auth/forgot-password',
      data,
    );
    return handleApiResponse(response.data);
  },

  /**
   * Validate password reset token
   */
  validateResetToken: async (token: string): Promise<ValidateResetTokenResponse> => {
    const response = await apiClient.get<ApiResponse<ValidateResetTokenResponse>>(
      '/auth/reset-password/validate',
      { params: { token } },
    );
    return handleApiResponse(response.data);
  },

  /**
   * Reset password with token
   */
  resetPassword: async (data: ResetPasswordWithTokenRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/auth/reset-password',
      data,
    );
    return handleApiResponse(response.data);
  },
};

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string;
  resetUrl?: string;
  emailSent?: boolean;
}

export interface ValidateResetTokenResponse {
  email: string;
}

export interface ResetPasswordWithTokenRequest {
  token: string;
  password: string;
}
