import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { WebhookHeaders } from '../payment/payment-provider';
import { BillingService } from './billing.service';

@ApiTags('payments')
@Controller('payments')
export class WebhookController {
  constructor(private readonly billing: BillingService) {}

  /**
   * Where the payment provider reports what happened. There is no login: the
   * signature on the request is what proves who sent it. It is checked
   * against the exact bytes received, which is why main.ts keeps the raw body.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: WebhookHeaders,
  ) {
    const { duplicate } = await this.billing.receive(request.rawBody, headers);
    return { received: true, duplicate };
  }
}
