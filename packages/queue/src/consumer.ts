import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({});

export const consumer = {
  receiveMessages: async (queueUrl: string, maxMessages = 10, waitTimeSeconds = 20) => {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
      AttributeNames: ['All'],
      MessageAttributeNames: ['All']
    });
    const { Messages } = await sqs.send(command);
    return Messages || [];
  },

  deleteMessage: async (queueUrl: string, receiptHandle: string) => {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle
    });
    return sqs.send(command);
  },

  changeVisibility: async (queueUrl: string, receiptHandle: string, visibilityTimeout: number) => {
    const command = new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: visibilityTimeout
    });
    return sqs.send(command);
  }
};
