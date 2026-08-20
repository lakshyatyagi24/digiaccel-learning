import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(query: ListUsersQueryDto) {
    const { items, total } = await this.usersRepository.findMany({
      role: query.role,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
    return { items, meta: { page: query.page, limit: query.limit, total } };
  }
}
