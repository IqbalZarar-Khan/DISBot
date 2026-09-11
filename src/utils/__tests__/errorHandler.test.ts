import { sendChannelWithRetry } from '../errorHandler';

describe('errorHandler - sendChannelWithRetry', () => {
    test('sends message successfully on first attempt', async () => {
        const mockSend = jest.fn().mockResolvedValue({ id: 'msg-123' });
        const mockChannel = { send: mockSend };

        const result = await sendChannelWithRetry(mockChannel, { content: 'hello' }, 3, 'test');
        expect(result).toEqual({ id: 'msg-123' });
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('retries and succeeds after transient SSL handshake failure', async () => {
        const sslError = new Error('4802650D7E7F0000:error:0A000410:SSL routines:ssl3_read_bytes:sslv3 alert handshake failure:SSL alert number 40');
        const mockSend = jest.fn()
            .mockRejectedValueOnce(sslError)
            .mockResolvedValueOnce({ id: 'msg-recovered' });
        const mockChannel = { send: mockSend };

        const result = await sendChannelWithRetry(mockChannel, { content: 'hello' }, 3, 'test');
        expect(result).toEqual({ id: 'msg-recovered' });
        expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('throws after exceeding max retries for persistent error', async () => {
        const networkError = new Error('ECONNRESET');
        const mockSend = jest.fn().mockRejectedValue(networkError);
        const mockChannel = { send: mockSend };

        await expect(sendChannelWithRetry(mockChannel, { content: 'hello' }, 2, 'test'))
            .rejects
            .toThrow('ECONNRESET');
        expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('fails immediately without retry for non-transient permission errors', async () => {
        const permError = new Error('Missing Permissions (50013)');
        const mockSend = jest.fn().mockRejectedValue(permError);
        const mockChannel = { send: mockSend };

        await expect(sendChannelWithRetry(mockChannel, { content: 'hello' }, 3, 'test'))
            .rejects
            .toThrow('Missing Permissions (50013)');
        expect(mockSend).toHaveBeenCalledTimes(1);
    });
});
