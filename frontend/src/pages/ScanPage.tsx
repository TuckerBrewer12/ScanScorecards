import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useScan } from "@/hooks/useScan";
import { ScanUploadStep } from "@/components/scan/ScanUploadStep";
import { ScanManualSetup } from "@/components/scan/ScanManualSetup";
import { ScanProcessing } from "@/components/scan/ScanProcessing";
import { ScanReviewStep } from "@/components/scan/ScanReviewStep";
import { ScanSuccessStep } from "@/components/scan/ScanSuccessStep";
import { useScanState } from "@/context/ScanContext";
import { initialScanState } from "@/types/scan";
import { api } from "@/lib/api";

export function ScanPage({ userId }: { userId: string }) {
  const { scanState, setScanState } = useScanState();
  const navigate = useNavigate();
  const scan = useScan(userId, scanState, setScanState);

  const { data: savedRound } = useQuery({
    queryKey: ["round", scan.savedRoundId],
    queryFn: () => api.getRound(scan.savedRoundId!),
    enabled: scan.step === "success" && !!scan.savedRoundId,
  });

  if (scan.step === "success" && scan.savedRoundId) {
    return savedRound ? (
      <ScanSuccessStep
        round={savedRound}
        onView={() => {
          const id = scan.savedRoundId!;
          setScanState(initialScanState);
          navigate(`/rounds/${id}`);
        }}
      />
    ) : (
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    );
  }

  if (scan.step === "processing") {
    return <ScanProcessing scanMode={scan.scanMode} />;
  }

  if (scan.step === "review") {
    if (!scan.result) return null;
    return (
      <ScanReviewStep
        result={scan.result}
        scanMode={scan.scanMode}
        editedScores={scan.editedScores}
        editedDate={scan.editedDate}
        editedTeeBox={scan.editedTeeBox}
        error={scan.error}
        preview={scan.preview}
        reviewCourseId={scan.reviewCourseId}
        reviewExternalCourseId={scan.reviewExternalCourseId}
        reviewCourseName={scan.reviewCourseName}
        saving={scan.saving}
        handicapIndex={scan.handicapIndex}
        reviewCourseQuery={scan.reviewCourseQuery}
        reviewCourseResults={scan.reviewCourseResults}
        reviewSearching={scan.reviewSearching}
        onReviewCourseQuery={scan.handleReviewCourseQuery}
        onSelectReviewCourse={scan.selectReviewCourse}
        onUpdate={scan.update}
        scoreMetadata={scan.scoreMetadata}
        badScanNullCount={scan.badScanNullCount}
        onScoreChange={scan.handleScoreChange}
        onGirChange={scan.handleGirChange}
        onSave={scan.handleSave}
        setReviewCourseQuery={scan.setReviewCourseQuery}
        setReviewCourseResults={scan.setReviewCourseResults}
        setScanState={setScanState}
      />
    );
  }

  // Upload step
  return (
    <>
      <ScanUploadStep
        scanMode={scan.scanMode}
        selectedCourseId={scan.selectedCourseId}
        selectedCourseName={scan.selectedCourseName}
        file={scan.file}
        preview={scan.preview}
        error={scan.error}
        dragOver={scan.dragOver}
        courseQuery={scan.courseQuery}
        courseResults={scan.courseResults}
        searching={scan.searching}
        loadingCourse={scan.loadingCourse}
        onModeChange={(mode) =>
          scan.update({
            scanMode: mode,
            selectedCourseId: null,
            selectedCourseName: null,
            file: null,
            preview: null,
            manualCourseHoles: [],
            manualCourseTees: [],
          })
        }
        onCourseQuery={scan.handleCourseQuery}
        onSelectCourse={scan.selectCourse}
        onSelectCourseManual={scan.selectCourseManual}
        onClearCourse={() =>
          scan.update({
            selectedCourseId: null,
            selectedCourseName: null,
          })
        }
        onFile={scan.handleFile}
        onDrop={scan.handleDrop}
        onDragOver={scan.setDragOver}
        onUpdate={scan.update}
        onExtract={scan.handleExtract}
      />

      {scan.scanMode === "manual" && (
        <ScanManualSetup
          selectedCourseId={scan.selectedCourseId}
          selectedCourseName={scan.selectedCourseName}
          manualCourseTees={scan.manualCourseTees}
          courseQuery={scan.courseQuery}
          courseResults={scan.courseResults}
          searching={scan.searching}
          loadingCourse={scan.loadingCourse}
          manualDate={scan.manualDate}
          manualTeeBox={scan.manualTeeBox}
          onCourseQuery={scan.handleCourseQuery}
          onSelectCourseManual={scan.selectCourseManual}
          onClearCourse={() =>
            scan.update({
              selectedCourseId: null,
              selectedCourseName: null,
              manualCourseHoles: [],
              manualCourseTees: [],
            })
          }
          onSetManualDate={scan.setManualDate}
          onSetManualTeeBox={scan.setManualTeeBox}
          onStartEntry={scan.handleStartEntry}
          onUpdate={scan.update}
          setCourseQuery={scan.setCourseQuery}
          setCourseResults={scan.setCourseResults}
        />
      )}
    </>
  );
}
