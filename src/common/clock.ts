import { Global, Injectable, Module } from '@nestjs/common';

// Rules that depend on the time (a grace period, an expiry) ask this for it
// instead of calling new Date(), so a test can put any clock in its place.
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
