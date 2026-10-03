import { Injectable } from '@nestjs/common';

import { mapPage, type Page, type PageRequest } from '../../common/pagination.js';
import { ConfigChangeEventRepository, type ConfigActivityFilter } from '../infrastructure/config-change-event.repository.js';
import { toConfigChangeEventDto, type ConfigChangeEventDto } from '../interface/dto/gateway-config-responses.js';

@Injectable()
export class ConfigActivityService {
	constructor(private readonly events: ConfigChangeEventRepository) {}

	async list(filter: ConfigActivityFilter, page: PageRequest): Promise<Page<ConfigChangeEventDto>> {
		const events = await this.events.listPage(filter, page);

		return mapPage(events, toConfigChangeEventDto);
	}

	async listRecent(since: Date, limit: number): Promise<readonly ConfigChangeEventDto[]> {
		const events = await this.events.listSince(since, limit);

		return events.map(toConfigChangeEventDto);
	}
}
