import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FileUpload from "../FileUpload";

// Mock fetch globally
vi.stubGlobal("fetch", vi.fn());

describe("FileUpload Component", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
  });

  it("renders upload interface", () => {
    render(<FileUpload onUploadSuccess={vi.fn()} />);

    // Check for file input
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });

  it("shows file info when file is selected", () => {
    render(<FileUpload onUploadSuccess={vi.fn()} />);

    const file = new File(["test,data\n1,2"], "test.csv", { type: "text/csv" });

    // Simulate file selection
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    expect(screen.getByText("Upload File")).toBeInTheDocument();
    expect(screen.getByText("test.csv")).toBeInTheDocument();
  });

  it("validates file type", () => {
    render(<FileUpload onUploadSuccess={vi.fn()} />);

    const input = document.querySelector('input[type="file"]');
    const invalidFile = new File(["test"], "test.txt", { type: "text/plain" });

    Object.defineProperty(input, "files", {
      value: [invalidFile],
      writable: false,
    });

    fireEvent.change(input);

    // Should show error for non-CSV file
    expect(screen.queryByText("Upload File")).not.toBeInTheDocument();
  });
});
