import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload } from "lucide-react";

const FileUpload = ({ onUploadSuccess, projectName }) => {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileChange = e => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setUploadStatus("");
    } else {
      setUploadStatus("error");
      setFile(null);
      setTimeout(() => setUploadStatus(""), 3000);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus("loading");

    const formData = new FormData();
    formData.append("csvFile", file);
    if (projectName) {
      formData.append("projectName", projectName);
    }

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 100);

      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const result = await response.json();
        setUploadStatus("success");
        console.log("Upload successful:", result);
        // Call success callback if provided
        if (onUploadSuccess) {
          setTimeout(() => onUploadSuccess(result), 1000);
        }
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadStatus("error");
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setUploadProgress(0);
        if (uploadStatus === "success") {
          setFile(null);
          setUploadStatus("");
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      }, 2000);
    }
  };

  const formatFileSize = bytes => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusMessage = () => {
    switch (uploadStatus) {
      case "success":
        return "File uploaded successfully! 🎉";
      case "error":
        return "Upload failed. Please ensure you're uploading a valid CSV file.";
      case "loading":
        return "Uploading file...";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
        />
        {file && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <strong>Name:</strong> {file.name}
            </p>
            <p>
              <strong>Size:</strong> {formatFileSize(file.size)}
            </p>
          </div>
        )}
      </div>

      {file && (
        <Button
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full"
        >
          {isUploading ? "Uploading..." : "Upload File"}
        </Button>
      )}

      {uploadProgress > 0 && (
        <Progress value={uploadProgress} className="w-full" />
      )}

      {uploadStatus && (
        <Alert
          variant={
            uploadStatus === "success"
              ? "success"
              : uploadStatus === "error"
                ? "destructive"
                : "default"
          }
        >
          {uploadStatus === "success" && <CheckCircle className="h-4 w-4" />}
          {uploadStatus === "error" && <XCircle className="h-4 w-4" />}
          {uploadStatus === "loading" && <Upload className="h-4 w-4" />}
          <AlertDescription>{getStatusMessage()}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default FileUpload;
