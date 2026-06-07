import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DetailPageLayout,
  DetailPageFullBleed,
  DetailPageBody,
  DetailPagePrimary,
  DetailPageRail,
  DetailPageProse,
} from "./DetailPageLayout";

describe("DetailPageLayout", () => {
  it("renders every region's content so no slot is dropped", () => {
    render(
      <DetailPageLayout>
        <DetailPageFullBleed>
          <h1>Ticket header</h1>
        </DetailPageFullBleed>
        <DetailPageBody>
          <DetailPagePrimary>
            <DetailPageProse>
              <p>The ticket description prose</p>
            </DetailPageProse>
            <p>Activity log entry</p>
          </DetailPagePrimary>
          <DetailPageRail>
            <p>Cost panel</p>
          </DetailPageRail>
        </DetailPageBody>
      </DetailPageLayout>
    );

    // A user navigating the page sees content from each region.
    expect(screen.getByRole("heading", { name: "Ticket header" })).toBeInTheDocument();
    expect(screen.getByText("The ticket description prose")).toBeInTheDocument();
    expect(screen.getByText("Activity log entry")).toBeInTheDocument();
    expect(screen.getByText("Cost panel")).toBeInTheDocument();
  });

  it("exposes the rail as a complementary landmark for assistive tech", () => {
    render(
      <DetailPageLayout>
        <DetailPageBody>
          <DetailPagePrimary>
            <p>Primary content</p>
          </DetailPagePrimary>
          <DetailPageRail>
            <p>Rail content</p>
          </DetailPageRail>
        </DetailPageBody>
      </DetailPageLayout>
    );

    const rail = screen.getByRole("complementary");
    expect(rail).toHaveTextContent("Rail content");
    expect(rail).not.toHaveTextContent("Primary content");
  });

  it("labels the rail landmark when ariaLabel is provided", () => {
    render(
      <DetailPageLayout>
        <DetailPageBody>
          <DetailPagePrimary>
            <p>Primary content</p>
          </DetailPagePrimary>
          <DetailPageRail ariaLabel="Ticket details">
            <p>Rail content</p>
          </DetailPageRail>
        </DetailPageBody>
      </DetailPageLayout>
    );

    expect(screen.getByRole("complementary", { name: "Ticket details" })).toBeInTheDocument();
  });
});
