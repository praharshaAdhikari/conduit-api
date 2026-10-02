import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { invalid, notFound } from '../common/api-error';
import { User } from '../user/user.entity';
import { Follow } from './follow.entity';

export interface Profile {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
}

export function toProfile(user: User, following: boolean): Profile {
  return {
    username: user.username,
    bio: user.bio,
    image: user.image,
    following,
  };
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
  ) {}

  async get(username: string, viewerId?: number): Promise<Profile> {
    const user = await this.getUser(username);
    const followed = await this.followedAmong([user.id], viewerId);
    return toProfile(user, followed.has(user.id));
  }

  async follow(username: string, viewerId: number): Promise<Profile> {
    const user = await this.getUser(username);
    if (user.id === viewerId) {
      throw invalid({ profile: ["can't follow yourself"] });
    }
    // Following twice is not an error; the first follow stays.
    await this.follows
      .createQueryBuilder()
      .insert()
      .values({
        followerId: viewerId,
        followedId: user.id,
        createdAt: new Date(),
      })
      .orIgnore()
      .execute();
    return toProfile(user, true);
  }

  async unfollow(username: string, viewerId: number): Promise<Profile> {
    const user = await this.getUser(username);
    await this.follows.delete({ followerId: viewerId, followedId: user.id });
    return toProfile(user, false);
  }

  /** Which of these users the viewer follows. Empty for an anonymous viewer. */
  async followedAmong(
    userIds: number[],
    viewerId?: number,
  ): Promise<Set<number>> {
    if (viewerId === undefined || userIds.length === 0) return new Set();
    const rows = await this.follows.findBy({
      followerId: viewerId,
      followedId: In(userIds),
    });
    return new Set(rows.map((row) => row.followedId));
  }

  private async getUser(username: string): Promise<User> {
    const user = await this.users.findOneBy({ username });
    if (!user) throw notFound('profile');
    return user;
  }
}
