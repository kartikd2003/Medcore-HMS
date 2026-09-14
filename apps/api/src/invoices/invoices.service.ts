import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceItemSource, InvoiceStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';

const BILLING_ROLES: Role[] = [Role.RECEPTIONIST, Role.ACCOUNTANT, Role.HOSPITAL_ADMIN];

// Shared include so listForHospital and findOne return the same
// shape — patient name is what accountant-facing UI actually needs
// to identify an invoice, which the query didn't surface before.
const INVOICE_INCLUDE = {
  items: true,
  patient: { select: { user: { select: { firstName: true, lastName: true } } } },
} as const;

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async generate(user: AuthenticatedUser, dto: GenerateInvoiceDto) {
    if (!BILLING_ROLES.includes(user.role) || !user.hospitalId) {
      throw new ForbiddenException('Only billing staff can generate an invoice');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: {
        medicalRecord: {
          include: {
            prescription: { include: { items: { include: { medicine: true } } } },
            labOrders: { include: { labTest: true } },
          },
        },
      },
    });
    if (!appointment || appointment.deletedAt) throw new NotFoundException('Appointment not found');
    if (appointment.hospitalId !== user.hospitalId) throw new ForbiddenException('Not your hospital');
    if (!appointment.medicalRecord) throw new BadRequestException('Appointment has no medical record yet — nothing to bill');

    const existing = await this.prisma.invoice.findUnique({ where: { appointmentId: appointment.id } });
    if (existing) throw new BadRequestException('An invoice already exists for this appointment');

    const items: {
      source: InvoiceItemSource;
      description: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      sourceRefId?: string;
    }[] = [
      {
        source: InvoiceItemSource.CONSULTATION,
        description: 'Consultation fee',
        quantity: 1,
        unitPrice: dto.consultationFee,
        lineTotal: dto.consultationFee,
      },
    ];

    const dispensedItems = appointment.medicalRecord.prescription?.items.filter((i) => i.dispensedAt) ?? [];
    for (const item of dispensedItems) {
      const unitPrice = Number(item.medicine.unitPrice);
      items.push({
        source: InvoiceItemSource.PHARMACY,
        description: `${item.medicine.name} (${item.dosage}, ${item.frequency})`,
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
        sourceRefId: item.id,
      });
    }

    const approvedLabOrders = appointment.medicalRecord.labOrders.filter((o) => o.status === 'APPROVED');
    for (const order of approvedLabOrders) {
      const price = Number(order.labTest.price);
      items.push({
        source: InvoiceItemSource.LAB,
        description: order.labTest.name,
        quantity: 1,
        unitPrice: price,
        lineTotal: price,
        sourceRefId: order.id,
      });
    }

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const tax = 0;
    const total = subtotal + tax;

    return this.prisma.invoice.create({
      data: {
        hospitalId: appointment.hospitalId,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        status: InvoiceStatus.PENDING,
        subtotal,
        tax,
        total,
        items: { create: items },
      },
      include: INVOICE_INCLUDE,
    });
  }

  async pay(user: AuthenticatedUser, id: string, dto: PayInvoiceDto) {
    if (!BILLING_ROLES.includes(user.role) || !user.hospitalId) {
      throw new ForbiddenException('Only billing staff can record a payment');
    }
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.hospitalId !== user.hospitalId) throw new ForbiddenException('Not your hospital');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice is already paid');
    if (invoice.status === InvoiceStatus.VOID) throw new BadRequestException('Invoice is void');

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date(), paymentGatewayRef: dto.paymentGatewayRef },
      include: INVOICE_INCLUDE,
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (user.role === Role.PATIENT) {
      const patient = await this.prisma.patient.findUnique({ where: { userId: user.id } });
      if (patient?.id !== invoice.patientId) throw new ForbiddenException('Not your invoice');
    } else if (BILLING_ROLES.includes(user.role)) {
      if (user.hospitalId !== invoice.hospitalId) throw new ForbiddenException('Not your hospital');
    } else {
      throw new ForbiddenException('Your role cannot view invoices');
    }

    return invoice;
  }

  async listMine(user: AuthenticatedUser) {
    if (user.role !== Role.PATIENT) throw new ForbiddenException('Only a patient can list their own invoices');
    const patient = await this.prisma.patient.findUnique({ where: { userId: user.id } });
    if (!patient) return [];
    return this.prisma.invoice.findMany({
      where: { patientId: patient.id },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForHospital(user: AuthenticatedUser) {
    if (!BILLING_ROLES.includes(user.role) || !user.hospitalId) {
      throw new ForbiddenException('Only billing staff can list hospital invoices');
    }
    return this.prisma.invoice.findMany({
      where: { hospitalId: user.hospitalId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }
}
