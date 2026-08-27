/**
 * WebSocket Service
 * Handles real-time communication with clients
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../logger';

export interface WebSocketMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface TaskUpdateMessage extends WebSocketMessage {
  type: 'task.update';
  data: {
    taskId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
    progress?: number;
    currentStep?: string;
    message?: string;
  };
}

export interface VulnerabilityFoundMessage extends WebSocketMessage {
  type: 'vulnerability.found';
  data: {
    taskId: string;
    vulnerabilityId: string;
    vulnerabilityName: string;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
    evidence: string;
  };
}

export interface AgentHealthUpdateMessage extends WebSocketMessage {
  type: 'agent.health.update';
  data: {
    agentId: string;
    status: 'healthy' | 'unhealthy' | 'unknown';
    responseTime?: number;
  };
}

export class WebSocketService {
  private io: SocketIOServer | null = null;

  /**
   * Initialize WebSocket service
   */
  initialize(io: SocketIOServer) {
    this.io = io;
    this.setupAuthentication();
    this.setupConnectionHandling();
    logger.info('WebSocket service initialized');
  }

  /**
   * Setup WebSocket authentication
   */
  private setupAuthentication() {
    if (!this.io) { return; }

    this.io.use(
      async (
        socket: Socket & { data: { user?: { userId: string; organizationId: string } } },
        next,
      ) => {
        try {
          const token = socket.handshake.auth.token;
          if (!token) {
            return next(new Error('Authentication token required'));
          }

          // Verify JWT token
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as {
            userId: string;
            organizationId: string;
          };

          socket.data.user = {
            userId: decoded.userId,
            organizationId: decoded.organizationId,
          };

          next();
        } catch (error) {
          logger.warn(`WebSocket authentication failed: ${error}`);
          next(new Error('Authentication failed'));
        }
      },
    );
  }

  /**
   * Setup connection handling
   */
  private setupConnectionHandling() {
    if (!this.io) { return; }

    this.io.on(
      'connection',
      (socket: Socket & { data: { user?: { userId: string; organizationId: string } } }) => {
        const userId = socket.data.user?.userId;
        logger.info(`WebSocket client connected: ${socket.id}, user: ${userId}`);

        // Join user-specific room
        if (userId) {
          socket.join(`user:${userId}`);
        }

        // Handle task run subscriptions
        socket.on('subscribe:task-run', (runId: string) => {
          socket.join(`task-run:${runId}`);
          logger.debug(`Client ${socket.id} subscribed to task-run:${runId}`);
        });

        socket.on('unsubscribe:task-run', (runId: string) => {
          socket.leave(`task-run:${runId}`);
          logger.debug(`Client ${socket.id} unsubscribed from task-run:${runId}`);
        });

        // Handle task subscriptions
        socket.on('subscribe:task', (taskId: string) => {
          socket.join(`task:${taskId}`);
          logger.debug(`Client ${socket.id} subscribed to task:${taskId}`);
        });

        socket.on('unsubscribe:task', (taskId: string) => {
          socket.leave(`task:${taskId}`);
          logger.debug(`Client ${socket.id} unsubscribed from task:${taskId}`);
        });

        // Handle agent subscriptions
        socket.on('subscribe:agent', (agentId: string) => {
          socket.join(`agent:${agentId}`);
          logger.debug(`Client ${socket.id} subscribed to agent:${agentId}`);
        });

        socket.on('unsubscribe:agent', (agentId: string) => {
          socket.leave(`agent:${agentId}`);
          logger.debug(`Client ${socket.id} unsubscribed from agent:${agentId}`);
        });

        // Handle organization subscriptions
        socket.on('subscribe:organization', (organizationId: string) => {
          socket.join(`organization:${organizationId}`);
          logger.debug(`Client ${socket.id} subscribed to organization:${organizationId}`);
        });

        socket.on('unsubscribe:organization', (organizationId: string) => {
          socket.leave(`organization:${organizationId}`);
          logger.debug(`Client ${socket.id} unsubscribed from organization:${organizationId}`);
        });

        socket.on('disconnect', (reason) => {
          logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
        });
      },
    );
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, message: WebSocketMessage) {
    if (!this.io) { return; }
    this.io.to(`user:${userId}`).emit('message', message);
  }

  /**
   * Send message to all users in organization
   */
  sendToOrganization(organizationId: string, message: WebSocketMessage) {
    if (!this.io) { return; }
    this.io.to(`organization:${organizationId}`).emit('message', message);
  }

  /**
   * Send task update message
   */
  sendTaskUpdate(taskId: string, data: TaskUpdateMessage['data']) {
    if (!this.io) { return; }

    const message: TaskUpdateMessage = {
      type: 'task.update',
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.to(`task:${taskId}`).emit('message', message);
    logger.debug(`Task update sent: ${taskId}, status: ${data.status}`);
  }

  /**
   * Send vulnerability found message
   */
  sendVulnerabilityFound(taskId: string, data: VulnerabilityFoundMessage['data']) {
    if (!this.io) { return; }

    const message: VulnerabilityFoundMessage = {
      type: 'vulnerability.found',
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.to(`task:${taskId}`).emit('message', message);
    logger.debug(`Vulnerability found sent: ${taskId}, vuln: ${data.vulnerabilityName}`);
  }

  /**
   * Send agent health update
   */
  sendAgentHealthUpdate(agentId: string, data: AgentHealthUpdateMessage['data']) {
    if (!this.io) { return; }

    const message: AgentHealthUpdateMessage = {
      type: 'agent.health.update',
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.to(`agent:${agentId}`).emit('message', message);
    logger.debug(`Agent health update sent: ${agentId}, status: ${data.status}`);
  }

  /**
   * Send task run progress update
   */
  sendTaskRunProgress(runId: string, progress: number, currentStep?: string, message?: string) {
    if (!this.io) { return; }

    const updateData: TaskUpdateMessage['data'] = {
      taskId: runId, // For run updates, taskId is used as runId
      status: 'running',
      progress,
      currentStep,
      message,
    };

    const taskMessage: TaskUpdateMessage = {
      type: 'task.update',
      data: updateData,
      timestamp: new Date().toISOString(),
    };

    this.io.to(`task-run:${runId}`).emit('message', taskMessage);
    logger.debug(`Task run progress sent: ${runId}, progress: ${progress}%`);
  }

  /**
   * Broadcast system-wide message
   */
  broadcastSystemMessage(message: WebSocketMessage) {
    if (!this.io) { return; }
    this.io.emit('system-message', message);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.io?.sockets.sockets.size || 0;
  }

  /**
   * Get clients in specific room
   */
  getClientsInRoom(room: string): string[] {
    if (!this.io) { return []; }
    const roomSockets = this.io.sockets.adapter.rooms.get(room);
    return roomSockets ? Array.from(roomSockets) : [];
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.io !== null;
  }
}

export const websocketService = new WebSocketService();
