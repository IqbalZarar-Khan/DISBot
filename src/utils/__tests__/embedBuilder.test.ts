import { createDepartureEmbed } from '../embedBuilder';

describe('embedBuilder', () => {
    test('createDepartureEmbed formats departure with tier name and emoji', () => {
        const embed = createDepartureEmbed({
            fullName: 'Mhee Wattson',
            tierName: 'Diamond',
            isCancellation: false,
        });

        const json = embed.toJSON();
        expect(json.title).toBe('👋 Member Departed');
        expect(json.description).toBe('**Mhee Wattson** has ended their **💎 Diamond** pledge.');
        expect(json.color).toBe(0x808080);
    });

    test('createDepartureEmbed formats departure without tier name', () => {
        const embed = createDepartureEmbed({
            fullName: 'Mhee Wattson',
            tierName: null,
            isCancellation: false,
        });

        const json = embed.toJSON();
        expect(json.title).toBe('👋 Member Departed');
        expect(json.description).toBe('**Mhee Wattson** has ended their pledge.');
        expect(json.color).toBe(0x808080);
    });

    test('createDepartureEmbed formats departure when tier is "Free" or "free"', () => {
        const embed = createDepartureEmbed({
            fullName: 'Mhee Wattson',
            tierName: 'Free',
            isCancellation: false,
        });

        const json = embed.toJSON();
        expect(json.title).toBe('👋 Member Departed');
        expect(json.description).toBe('**Mhee Wattson** has ended their pledge.');
    });

    test('createDepartureEmbed formats cancellation with tier name', () => {
        const embed = createDepartureEmbed({
            fullName: 'Mhee Wattson',
            tierName: 'Gold',
            isCancellation: true,
        });

        const json = embed.toJSON();
        expect(json.title).toBe('❌ Pledge Cancelled');
        expect(json.description).toContain('cancelled');
        expect(json.description).toContain('Gold');
        expect(json.color).toBe(0xFF0000);
    });

    test('createDepartureEmbed formats cancellation without tier name', () => {
        const embed = createDepartureEmbed({
            fullName: 'Mhee Wattson',
            tierName: undefined,
            isCancellation: true,
        });

        const json = embed.toJSON();
        expect(json.title).toBe('❌ Pledge Cancelled');
        expect(json.description).toBe('**Mhee Wattson** has cancelled their pledge.');
        expect(json.color).toBe(0xFF0000);
    });
});
