import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { AuthenticatedUser } from '../auth/auth.types';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * HOSPITAL_ADMIN provisions staff for their own hospital only —
   * hospitalId is taken from the caller's own token, never from the
   * request body, so an admin can't create a user in another tenant.
   */
  async createStaff(admin: AuthenticatedUser, dto: CreateStaffDto) {
    if (admin.role !== Role.HOSPITAL_ADMIN || !admin.hospitalId) {
      throw new ForbiddenException('Only a hospital admin can provision staff');
    }
    if ((dto.role as Role) === Role.PATIENT || (dto.role as Role) === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot provision this role through staff creation');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.temporaryPassword, SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role as Role,
        hospitalId: admin.hospitalId,
        isEmailVerified: true, // staff accounts are pre-verified by the admin who creates them
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        hospitalId: true,
      },
    });
  }

  async findByHospital(hospitalId: string) {
    return this.prisma.user.findMany({
      where: { hospitalId, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
  }

  async deactivate(admin: AuthenticatedUser, userId: string) {
    const target = await this.getScopedTarget(admin, userId);
    return this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  }

  /**
   * Reactivation — a deliberate, separate decision from deactivate,
   * not a symmetric toggle exposed on the same endpoint. Scoped
   * identically: only the hospital admin of the account's own
   * hospital can flip it back on.
   */
  async activate(admin: AuthenticatedUser, userId: string) {
    const target = await this.getScopedTarget(admin, userId);
    return this.prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  }

  private async getScopedTarget(admin: AuthenticatedUser, userId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (admin.role !== Role.HOSPITAL_ADMIN || target.hospitalId !== admin.hospitalId) {
      throw new ForbiddenException('Cannot manage users outside your hospital');
    }
    return target;
  }
}
