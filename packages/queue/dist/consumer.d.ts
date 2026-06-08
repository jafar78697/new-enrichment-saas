export declare const consumer: {
    receiveMessages: (queueUrl: string, maxMessages?: number, waitTimeSeconds?: number) => Promise<import("@aws-sdk/client-sqs").Message[]>;
    deleteMessage: (queueUrl: string, receiptHandle: string) => Promise<import("@aws-sdk/client-sqs").DeleteMessageCommandOutput>;
    changeVisibility: (queueUrl: string, receiptHandle: string, visibilityTimeout: number) => Promise<import("@aws-sdk/client-sqs").ChangeMessageVisibilityCommandOutput>;
};
//# sourceMappingURL=consumer.d.ts.map