import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from './users.service';
import { CreateStaffDto } from './dto/create-staff.dto';

@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles(Role.HOSPITAL_ADMIN)
  @Post('staff')
  createStaff(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.usersService.createStaff(admin, dto);
  }

  @Roles(Role.HOSPITAL_ADMIN)
  @Get('hospital/:hospitalId')
  listHospitalUsers(@Param('hospitalId') hospitalId: string) {
    return this.usersService.findByHospital(hospitalId);
  }

  @Roles(Role.HOSPITAL_ADMIN)
  @Delete(':id')
  deactivate(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.deactivate(admin, id);
  }

  // A deliberate, separate decision from deactivate — see the
  // service's comment. Not a symmetric toggle on one endpoint.
  @Roles(Role.HOSPITAL_ADMIN)
  @Patch(':id/activate')
  activate(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.activate(admin, id);
  }
}
