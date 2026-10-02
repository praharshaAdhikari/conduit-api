import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipController } from './membership.controller';
import { Membership, MembershipEvent } from './membership.entity';
import { MembershipService } from './membership.service';

@Module({
  imports: [TypeOrmModule.forFeature([Membership, MembershipEvent])],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService, TypeOrmModule],
})
export class MembershipModule {}
