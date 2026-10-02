import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { invalid } from '../../common/api-error';
import { checkoutPage } from './checkout-page';
import { DELIVERIES, Delivery, FakePayService } from './fake-pay.service';

// Only registered when PAYMENT_PROVIDER=fake. The first two routes are the
// checkout page a customer is sent to. The rest drive the provider from a
// test: what a real provider does on its own schedule (renewals, failed
// payments, endings, repeated webhooks) is done here on request. None of them
// need a login, exactly because they are the provider's side, not this API's.

function deliveryFrom(value: unknown): Delivery {
  if (value === undefined || value === '') return 'now';
  if (DELIVERIES.includes(value as Delivery)) return value as Delivery;
  throw invalid({ delivery: [`must be one of ${DELIVERIES.join(', ')}`] });
}

@ApiTags('fake payment provider')
@Controller('fake-pay')
export class FakePayController {
  constructor(private readonly fakePay: FakePayService) {}

  @Get('checkouts')
  async listCheckouts() {
    return { checkouts: await this.fakePay.listCheckouts() };
  }

  @Get('checkouts/:id')
  async page(@Param('id') id: string, @Res() response: Response) {
    const checkout = await this.fakePay.getCheckout(id);
    response.type('html').send(checkoutPage(checkout, false));
  }

  /** The checkout page's form. */
  @Post('checkouts/:id')
  async submit(
    @Param('id') id: string,
    @Body() body: { outcome?: string; delivery?: string },
    @Res() response: Response,
  ) {
    const checkout = await this.fakePay.getCheckout(id);
    if (body.outcome === 'cancel') {
      return response.redirect(303, checkout.cancelUrl);
    }
    if (body.outcome === 'pay' && checkout.status === 'open') {
      await this.fakePay.pay(id, deliveryFrom(body.delivery));
      return response.redirect(303, checkout.successUrl);
    }
    // A declined card leaves the checkout open, as it does with a real provider.
    response
      .status(200)
      .type('html')
      .send(checkoutPage(checkout, body.outcome === 'decline'));
  }

  /** Pays a checkout without the page, for tests that do not use a browser. */
  @Post('checkouts/:id/pay')
  @HttpCode(200)
  async pay(@Param('id') id: string, @Body() body: { delivery?: string }) {
    const { checkout, event } = await this.fakePay.pay(
      id,
      deliveryFrom(body?.delivery),
    );
    return { checkout, event };
  }

  @Post('checkouts/:id/expire')
  @HttpCode(200)
  async expire(@Param('id') id: string) {
    await this.fakePay.expireCheckout(id);
    return { checkout: await this.fakePay.getCheckout(id) };
  }

  @Get('subscriptions')
  async listSubscriptions() {
    return { subscriptions: await this.fakePay.listSubscriptions() };
  }

  @Post('subscriptions/:id/renew')
  @HttpCode(200)
  async renew(@Param('id') id: string, @Body() body: { delivery?: string }) {
    const delivery = deliveryFrom(body?.delivery);
    return { subscription: await this.fakePay.renew(id, delivery) };
  }

  @Post('subscriptions/:id/fail')
  @HttpCode(200)
  async fail(@Param('id') id: string, @Body() body: { delivery?: string }) {
    const delivery = deliveryFrom(body?.delivery);
    return { subscription: await this.fakePay.failRenewal(id, delivery) };
  }

  @Post('subscriptions/:id/end')
  @HttpCode(200)
  async end(@Param('id') id: string, @Body() body: { delivery?: string }) {
    const delivery = deliveryFrom(body?.delivery);
    return { subscription: await this.fakePay.end(id, delivery) };
  }

  @Get('events')
  async listEvents() {
    return { events: await this.fakePay.listEvents() };
  }

  @Post('events/:id/resend')
  @HttpCode(200)
  async resend(@Param('id') id: string) {
    return { event: await this.fakePay.resend(id) };
  }
}
