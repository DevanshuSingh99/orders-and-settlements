import { Table } from "@heroui/react";
import { formatCurrency } from "@/lib/format";
import type { LineItem } from "@/lib/api/types";

/** Read-only line items display for the order detail page. */
export function LineItemsTable({ lineItems }: { lineItems: LineItem[] }) {
  return (
    <Table aria-label="Line items">
      <Table.ScrollContainer>
        <Table.Content aria-label="Line items">
          <Table.Header>
            <Table.Column isRowHeader>Description</Table.Column>
            <Table.Column>Quantity</Table.Column>
            <Table.Column>Unit price</Table.Column>
            <Table.Column>Line total</Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => null}>
            {lineItems.map((item) => (
              <Table.Row key={item.id} id={item.id}>
                <Table.Cell>{item.description}</Table.Cell>
                <Table.Cell>{item.quantity}</Table.Cell>
                <Table.Cell>{formatCurrency(item.unitPrice)}</Table.Cell>
                <Table.Cell>{formatCurrency(item.lineTotal)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
