import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { AppHeader } from '../components/AppHeader';
import { StatusBadge } from '../components/StatusBadge';
import { UploadPdfModal } from '../components/UploadPdfModal';
import { ArrowLeft, Download, Upload, Calendar, User, Link as LinkIcon, Star, X, Check, Heart, MessageCircle, ShieldCheck } from 'lucide-react';
import { apiRequest, getStoredUser, resolveFileUrl } from '../lib/api';
import { formatDisplayDate } from '../lib/date';
import { PublicPaper } from '../lib/papers';
import { getSemesterLabel } from '../lib/papers';

type DetailPaper = PublicPaper & {
  requestedBy?: {
    _id?: string;
    fullName?: string;
    email?: string;
    university?: string;
    role?: 'user' | 'admin';
  };
  uploadedBy?: {
    _id?: string;
    fullName?: string;
    email?: string;
    university?: string;
    role?: 'user' | 'admin';
  };
};

type Rating = {
  _id: string;
  rating: number;
  user?: {
    _id: string;
    fullName?: string;
    university?: string;
    role?: 'user' | 'admin';
  };
};

type PaperComment = {
  _id: string;
  parentComment?: string | null;
  comment: string;
  createdAt: string;
  updatedAt?: string;
  likeCount: number;
  isLikedByCurrentUser: boolean;
  isLegacyRatingComment?: boolean;
  replies?: PaperComment[];
  user?: {
    _id: string;
    fullName?: string;
    university?: string;
    role?: 'user' | 'admin';
  };
};

type ProfileNameProps = {
  name?: string;
  role?: 'user' | 'admin';
  className?: string;
};

function ProfileName({ name, role, className = '' }: ProfileNameProps) {
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <span className="min-w-0 break-words">{name || 'User'}</span>
      {role === 'admin' && (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <ShieldCheck size={13} />
          Admin
        </span>
      )}
    </span>
  );
}

function withCommentDefaults(comment: PaperComment): PaperComment {
  return {
    ...comment,
    replies: comment.replies || [],
  };
}

function replaceCommentInTree(comments: PaperComment[], updatedComment: PaperComment) {
  return comments.map((comment) => {
    if (comment._id === updatedComment._id) {
      return { ...comment, ...updatedComment, replies: comment.replies || updatedComment.replies || [] };
    }

    return {
      ...comment,
      replies: (comment.replies || []).map((reply) =>
        reply._id === updatedComment._id ? { ...reply, ...updatedComment, replies: [] } : reply
      ),
    };
  });
}

function removeCommentFromTree(comments: PaperComment[], commentId: string) {
  return comments
    .filter((comment) => comment._id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: (comment.replies || []).filter((reply) => reply._id !== commentId),
    }));
}

function isPaperReviewable(paper: DetailPaper) {
  return ['approved', 'downloaded', 'not-downloaded'].includes(paper.status);
}

export function PaperDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin';
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [paper, setPaper] = useState<DetailPaper | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [comments, setComments] = useState<PaperComment[]>([]);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [existingRatingId, setExistingRatingId] = useState<string | null>(null);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [isRemovingRating, setIsRemovingRating] = useState(false);
  const [removingCommentId, setRemovingCommentId] = useState<string | null>(null);
  const [isAcceptingPdf, setIsAcceptingPdf] = useState(false);
  const [isRejectingPdf, setIsRejectingPdf] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadPaper() {
    if (!id) return;

    setIsLoading(true);
    setError('');

    try {
      let paperData: { paper: DetailPaper };

      try {
        paperData = await apiRequest<{ paper: DetailPaper }>(`/papers/${id}`, { auth: true });
      } catch {
        paperData = await apiRequest<{ paper: DetailPaper }>(`/public-papers/${id}`, { auth: true });
      }

      const [ratingsData, commentsData] = isPaperReviewable(paperData.paper)
        ? await Promise.all([
            apiRequest<{ ratings: Rating[] }>(`/ratings/papers/${id}`, { auth: true }),
            apiRequest<{ comments: PaperComment[] }>(`/ratings/papers/${id}/comments`, { auth: true }),
          ])
        : [{ ratings: [] }, { comments: [] }];
      const existingUserRating = ratingsData.ratings.find((rating) => rating.user?._id === currentUser?._id);

      setPaper(paperData.paper);
      setRatings(ratingsData.ratings);
      setComments(commentsData.comments);
      setUserRating(existingUserRating?.rating || 0);
      setUserComment('');
      setReplyTargetId(null);
      setReplyText('');
      setExistingRatingId(existingUserRating?._id || null);
      setIsEditingReview(false);
      setReviewError('');
      setCommentError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load paper detail');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPaper();
  }, [id]);

  const handleUploadPdf = async (file: File) => {
    if (!paper) return;

    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const data = await apiRequest<{ paper: DetailPaper }>(`/papers/${paper._id}/upload-pdf`, {
        method: 'POST',
        auth: true,
        body: formData,
      });

      setPaper(data.paper);
      setMessage('PDF uploaded successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload PDF');
    }
  };

  const handleDeletePdf = async () => {
    if (!paper) return;

    setError('');
    setMessage('');

    try {
      const data = await apiRequest<{ paper: DetailPaper }>(`/papers/${paper._id}/pdf`, {
        method: 'DELETE',
        auth: true,
      });

      setPaper(data.paper);
      setMessage('PDF deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete PDF');
    }
  };

  const handleAcceptPdf = async () => {
    if (!paper) return;

    setError('');
    setMessage('');
    setIsAcceptingPdf(true);

    try {
      const data = await apiRequest<{ paper: DetailPaper }>(`/papers/${paper._id}/accept-pdf`, {
        method: 'PATCH',
        auth: true,
      });

      setPaper(data.paper);
      setMessage('PDF accepted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept PDF');
    } finally {
      setIsAcceptingPdf(false);
    }
  };

  const handleRejectPdf = async () => {
    if (!paper) return;

    setError('');
    setMessage('');
    setIsRejectingPdf(true);

    try {
      const data = await apiRequest<{ paper: DetailPaper }>(`/papers/${paper._id}/reject-pdf`, {
        method: 'PATCH',
        auth: true,
      });

      setPaper(data.paper);
      setMessage('PDF rejected. The paper is waiting for another PDF upload.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject PDF');
    } finally {
      setIsRejectingPdf(false);
    }
  };

  const handleDownload = async () => {
    if (!paper) return;

    try {
      const isRequester = paper.requestedBy?._id === currentUser?._id;
      const canUsePrivateDownload = isAdmin || isRequester;
      const data = canUsePrivateDownload
        ? await apiRequest<{ downloadUrl: string }>(`/papers/${paper._id}/pdf-url`, { auth: true })
        : await apiRequest<{ downloadUrl: string }>(`/public-papers/${paper._id}/download`, {
            method: 'POST',
            auth: true,
          });

      const fileUrl = resolveFileUrl(data.downloadUrl);
      const resp = await fetch(fileUrl);
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paper.doi || paper.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download PDF');
    }
  };

  const handleRating = async (rating: number) => {
    if (!paper) return;

    setError('');
    setMessage('');
    setReviewError('');
    setCommentError('');
    setUserRating(rating);
  };

  const handleSubmitRating = async () => {
    if (!paper) return;

    setError('');
    setMessage('');
    setReviewError('');

    if (userRating === 0) {
      setReviewError('Please choose a star rating.');
      return;
    }

    setIsSubmittingRating(true);

    try {
      await apiRequest(existingRatingId ? `/ratings/${existingRatingId}` : `/ratings/papers/${paper._id}`, {
        method: existingRatingId ? 'PATCH' : 'POST',
        auth: true,
        body: JSON.stringify({ rating: userRating }),
      });

      setMessage(existingRatingId ? 'Rating updated successfully.' : 'Rating submitted successfully.');
      await loadPaper();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit rating');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleStartUpdateReview = (rating: Rating) => {
    setUserRating(rating.rating);
    setExistingRatingId(rating._id);
    setIsEditingReview(true);
    setReviewError('');
    setCommentError('');
    setError('');
    setMessage('');
  };

  const handleCancelReviewEdit = () => {
    const savedRating = ratings.find(r => r.user?._id === currentUser?._id);
    setUserRating(savedRating?.rating || 0);
    setIsEditingReview(false);
    setReviewError('');
    setCommentError('');
    setError('');
    setMessage('');
  };

  const handleRemoveReview = async (ratingId: string) => {
    setError('');
    setMessage('');
    setReviewError('');
    setCommentError('');
    setIsRemovingRating(true);

    try {
      await apiRequest(`/ratings/${ratingId}`, {
        method: 'DELETE',
        auth: true,
      });

      setMessage('Rating removed successfully.');
      setUserRating(0);
      setExistingRatingId(null);
      setIsEditingReview(false);
      await loadPaper();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove review');
    } finally {
      setIsRemovingRating(false);
    }
  };

  const handleSubmitComment = async (parentCommentId?: string) => {
    if (!paper) return;

    const nextComment = parentCommentId ? replyText.trim() : userComment.trim();
    setError('');
    setMessage('');
    setReviewError('');
    setCommentError('');

    if (!nextComment) {
      setCommentError('Please write a comment before submitting.');
      return;
    }

    if (parentCommentId) {
      setSubmittingReplyId(parentCommentId);
    } else {
      setIsSubmittingComment(true);
    }

    try {
      const data = await apiRequest<{ comment: PaperComment }>(`/ratings/papers/${paper._id}/comments`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ comment: nextComment, parentCommentId }),
      });

      setMessage(parentCommentId ? 'Reply posted successfully.' : 'Comment posted successfully.');
      const nextCreatedComment = withCommentDefaults(data.comment);

      setComments((currentComments) => {
        if (!parentCommentId) {
          return [nextCreatedComment, ...currentComments];
        }

        return currentComments.map((comment) =>
          comment._id === parentCommentId
            ? { ...comment, replies: [...(comment.replies || []), nextCreatedComment] }
            : comment
        );
      });

      if (parentCommentId) {
        setReplyTargetId(null);
        setReplyText('');
      } else {
        setUserComment('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : parentCommentId ? 'Unable to submit reply' : 'Unable to submit comment');
    } finally {
      setIsSubmittingComment(false);
      setSubmittingReplyId(null);
    }
  };

  const handleToggleCommentLike = async (commentId: string) => {
    setError('');
    setMessage('');

    try {
      const data = await apiRequest<{ comment: PaperComment }>(`/ratings/comments/${commentId}/like`, {
        method: 'PATCH',
        auth: true,
      });

      setComments((currentComments) => replaceCommentInTree(currentComments, data.comment));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update comment like');
    }
  };

  const handleRemoveComment = async (commentId: string) => {
    setError('');
    setMessage('');
    setReviewError('');
    setCommentError('');
    setRemovingCommentId(commentId);

    try {
      await apiRequest(`/ratings/comments/${commentId}`, {
        method: 'DELETE',
        auth: true,
      });

      setMessage('Comment removed successfully.');
      setComments((currentComments) => removeCommentFromTree(currentComments, commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove comment');
    } finally {
      setRemovingCommentId(null);
    }
  };

  const totalCommentCount = comments.reduce((count, comment) => count + 1 + (comment.replies?.length || 0), 0);

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-surface-workspace bg-fixed">
      <Sidebar role={isAdmin ? 'admin' : 'user'} />

      <div className="min-w-0 flex-1 p-8">
        <AppHeader role={isAdmin ? 'admin' : 'user'} />
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate(isAdmin ? '/admin/papers' : '/dashboard')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to {isAdmin ? 'Paper Management' : 'Dashboard'}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 mb-6">
              {message}
            </div>
          )}

          {isLoading && (
            <div className="bg-white rounded-lg border border-border shadow-sm p-12 text-center">
              <p className="text-muted-foreground">Loading paper detail...</p>
            </div>
          )}

          {!isLoading && paper && (
            <>
              {(() => {
                const isRequester = paper.requestedBy?._id === currentUser?._id;
                const uploadedByRequester = paper.uploadedBy?._id === paper.requestedBy?._id;
                const isPdfAvailable = Boolean(paper.pdfPath) && paper.status === 'downloaded';
                const isWaitingRequesterAccept =
                  paper.status === 'pending-requester-acceptance' ||
                  (paper.status === 'pending' && Boolean(paper.pdfPath) && !uploadedByRequester);
                const canAcceptPdf = Boolean(currentUser && isRequester && isWaitingRequesterAccept && paper.pdfPath);
                const isPrivateDownload = isAdmin || isRequester || canAcceptPdf;
                const canPublicDownload = isPdfAvailable && paper.qualityTier !== 0 && paper.downloadCost !== null;
                const canDownloadPdf = Boolean(paper.pdfPath && (isPrivateDownload || canPublicDownload));
                const canUploadPdf = Boolean(
                  currentUser && !paper.pdfPath && (isAdmin || isRequester || paper.status === 'not-downloaded')
                );

                return (
                  <>
              <div className="bg-white rounded-lg border border-border shadow-sm p-8 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h1 className="text-foreground mb-4">{paper.title}</h1>
                    <div className="flex items-center gap-4 mb-4">
                      <StatusBadge status={paper.status} />
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={20}
                            className={star <= Math.round(paper.averageRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                          />
                        ))}
                        <span className="text-muted-foreground ml-2">
                          {paper.averageRating.toFixed(1)} ({paper.totalRatings} ratings)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <div>
                      <p className="text-muted-foreground mb-1">DOI</p>
                      <p className="text-foreground">{paper.doi}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Paper Type</p>
                      <p className="text-foreground">{paper.paperType || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Authors</p>
                      <p className="text-foreground">{paper.authors?.length ? paper.authors.join(', ') : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Publication Year</p>
                      <p className="text-foreground">{paper.publishedYear}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Related Semesters</p>
                      <p className="text-foreground">{paper.relatedSemesters?.length ? paper.relatedSemesters.map((s) => getSemesterLabel(s)).join(', ') : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Application Domain</p>
                      <p className="text-foreground">{paper.applicationDomain || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Paper Link</p>
                      <a href={paper.paperLink} className="text-primary hover:underline flex items-start gap-2 min-w-0">
                        <LinkIcon size={16} />
                        <span className="min-w-0 break-all">{paper.paperLink}</span>
                      </a>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">Requested By</p>
                        <p className="text-foreground">
                          <ProfileName name={paper.requestedBy?.fullName || 'N/A'} role={paper.requestedBy?.role} />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">Request Date</p>
                        <p className="text-foreground">{formatDisplayDate(paper.createdAt)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">University</p>
                      <p className="min-w-0 break-words text-foreground">{paper.requestedBy?.university || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-foreground mb-3">Abstract</h3>
                  <p className="text-muted-foreground leading-relaxed">{paper.abstract}</p>
                </div>

                <div className="mb-6">
                  <h3 className="text-foreground mb-3">Keywords</h3>
                  <div className="flex flex-wrap gap-2">
                    {paper.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-3 py-1 bg-accent text-accent-foreground rounded-full border border-border"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-border shadow-sm p-8 mb-6">
                <h3 className="text-foreground mb-4">PDF Document</h3>
                {paper.pdfPath ? (
                  <div className="space-y-4">
                    <div className="border border-border rounded-lg p-8 bg-muted flex items-center justify-center">
                      <p className="text-muted-foreground">
                        {isPdfAvailable ? 'PDF is available for download' : 'PDF is waiting for requester acceptance'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-white p-4">
                      <p className="text-sm text-muted-foreground">PDF UPLOADED BY :</p>
                      <p className="text-foreground">
                        <ProfileName name={paper.uploadedBy?.fullName || 'N/A'} role={paper.uploadedBy?.role} />
                        {paper.uploadedBy?.university ? ` - ${paper.uploadedBy.university}` : ''}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Quality Score</p>
                        <p className="text-base font-semibold text-foreground">{paper.qualityScore ?? 'N/A'}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Tier</p>
                        <p className="text-base font-semibold text-foreground">
                          {paper.qualityTierName || (paper.qualityTier !== undefined ? `Tier ${paper.qualityTier}` : 'N/A')}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-white p-3">
                        <p className="text-xs text-muted-foreground">Download Cost</p>
                        <p className="text-base font-semibold text-foreground">
                          {paper.downloadCost === null || paper.qualityTier === 0 ? 'Not allowed' : `${paper.downloadCost ?? 0} credits`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={handleDownload}
                        disabled={!canDownloadPdf}
                        className={`flex-1 py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                          canDownloadPdf
                            ? 'bg-primary text-primary-foreground hover:bg-blue-600'
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                        }`}
                      >
                        <Download size={20} />
                        Download PDF
                      </button>
                      {canAcceptPdf ? (
                        <button
                          type="button"
                          onClick={handleAcceptPdf}
                          disabled={isAcceptingPdf}
                          className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Check size={20} />
                          {isAcceptingPdf ? 'Accepting...' : 'Accept PDF'}
                        </button>
                      ) : null}
                      {canAcceptPdf ? (
                        <button
                          type="button"
                          onClick={handleRejectPdf}
                          disabled={isRejectingPdf}
                          className="flex-1 bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <X size={20} />
                          {isRejectingPdf ? 'Rejecting...' : 'Reject PDF'}
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          onClick={handleDeletePdf}
                          disabled={!paper.pdfPath}
                          className={`flex-1 py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                            paper.pdfPath
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-muted text-muted-foreground cursor-not-allowed'
                          }`}
                        >
                          <X size={20} />
                          Delete PDF
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg p-12 bg-muted text-center">
                    <p className="text-muted-foreground mb-4">No PDF yet</p>
                    {canUploadPdf && (
                      <button
                        onClick={() => setUploadModalOpen(true)}
                        className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
                      >
                        <Upload size={20} />
                        Upload PDF
                      </button>
                    )}
                    {!currentUser && <p className="text-sm text-muted-foreground">Sign in to upload the first PDF.</p>}
                  </div>
                )}
              </div>

              {currentUser && isPaperReviewable(paper) && (
                <div className="bg-white rounded-lg border border-border shadow-sm p-8">
                  <h3 className="text-foreground mb-4">Rate this paper</h3>

                  {!existingRatingId || isEditingReview ? (
                    <>
                      <div className="mb-6">
                        <p className="text-sm text-muted-foreground mb-3">Choose a star rating:</p>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleRating(star)}
                              onMouseEnter={() => setHoveredRating(star)}
                              onMouseLeave={() => setHoveredRating(0)}
                              className="transition-transform hover:scale-110"
                              aria-label={`Choose ${star} star rating`}
                            >
                              <Star
                                size={40}
                                className={
                                  star <= (hoveredRating || userRating)
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300 hover:text-yellow-200'
                                }
                              />
                            </button>
                          ))}
                        </div>
                        {userRating > 0 && (
                          <p className="text-sm text-foreground mt-2">
                            Selected rating: {userRating} stars
                          </p>
                        )}
                      </div>

                      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                        {reviewError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {reviewError}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSubmitRating}
                            disabled={isSubmittingRating}
                            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSubmittingRating ? 'Submitting...' : isEditingReview ? 'Save rating' : 'Submit rating'}
                          </button>
                          {isEditingReview && (
                            <button
                              type="button"
                              onClick={handleCancelReviewEdit}
                              className="px-6 py-2 border border-gray-300 rounded-lg text-foreground hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">Your rating is listed below. Use Update or Remove to manage it.</p>
                    </div>
                  )}

                  <div className="mt-6 border-t border-border pt-6">
                    <h3 className="text-foreground mb-4">Add a comment</h3>
                    {commentError && (
                      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {commentError}
                      </div>
                    )}
                    <label className="block">
                      <textarea
                        value={userComment}
                        onChange={(e) => {
                          setUserComment(e.target.value);
                          setCommentError('');
                        }}
                        placeholder="Share your thoughts about this paper..."
                        rows={4}
                        maxLength={500}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-foreground bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="text-xs text-gray-500 mt-1">{userComment.length}/500</p>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSubmitComment()}
                      disabled={isSubmittingComment}
                      className="mt-3 flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingComment ? 'Posting...' : 'Post comment'}
                    </button>
                  </div>
                </div>
              )}

              {ratings.some((rating) => rating.user?._id === currentUser?._id) && (
                <div className="bg-white rounded-lg border border-border shadow-sm p-8 mt-6">
                  <h3 className="text-foreground mb-4">Your rating</h3>
                  <div className="space-y-3">
                    {ratings.filter((rating) => rating.user?._id === currentUser?._id).map((rating) => {
                      const isOwnRating = rating.user?._id === currentUser?._id;

                      return (
                        <div
                          key={rating._id}
                          className="rounded-lg border border-blue-300 bg-blue-50 p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-foreground">
                                <ProfileName name={rating.user?.fullName || 'User'} role={rating.user?.role} />
                                <span className="ml-1">rated {rating.rating} / 5</span>
                                {isOwnRating && (
                                  <span className="ml-2 rounded-md bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                                    Your rating
                                  </span>
                                )}
                              </p>
                            </div>

                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartUpdateReview(rating)}
                                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100"
                              >
                                Update
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveReview(rating._id)}
                                disabled={isRemovingRating}
                                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isRemovingRating ? 'Removing...' : 'Remove'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {comments.length > 0 && (
                <div className="bg-white rounded-lg border border-border shadow-sm p-8 mt-6">
                  <h3 className="text-foreground mb-4">Comments ({totalCommentCount})</h3>
                  <div className="space-y-3">
                    {comments.map((comment) => {
                      const isOwnComment = comment.user?._id === currentUser?._id;
                      const canRemoveComment = (isOwnComment || isAdmin) && !comment.isLegacyRatingComment;

                      return (
                        <div key={comment._id} className="rounded-lg border border-border bg-white p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-foreground">
                                <ProfileName name={comment.user?.fullName || 'User'} role={comment.user?.role} />
                                {isOwnComment && (
                                  <span className="ml-2 rounded-md bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                                    Your comment
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{comment.comment}</p>
                              <p className="mt-2 text-xs text-gray-500">{formatDisplayDate(comment.createdAt)}</p>

                              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                                {!comment.isLegacyRatingComment && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCommentLike(comment._id)}
                                    className={`inline-flex items-center gap-1 transition-colors ${
                                      comment.isLikedByCurrentUser ? 'text-red-600' : 'text-muted-foreground hover:text-red-600'
                                    }`}
                                  >
                                    <Heart
                                      size={16}
                                      className={comment.isLikedByCurrentUser ? 'fill-red-500 text-red-500' : ''}
                                    />
                                    {comment.likeCount} {comment.likeCount === 1 ? 'like' : 'likes'}
                                  </button>
                                )}
                                {!comment.isLegacyRatingComment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyTargetId(replyTargetId === comment._id ? null : comment._id);
                                      setReplyText('');
                                      setCommentError('');
                                    }}
                                    className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
                                  >
                                    <MessageCircle size={16} />
                                    Reply
                                  </button>
                                )}
                              </div>

                              {replyTargetId === comment._id && (
                                <div className="mt-4 rounded-lg border border-border bg-gray-50 p-3">
                                  {commentError && (
                                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                      {commentError}
                                    </div>
                                  )}
                                  <textarea
                                    value={replyText}
                                    onChange={(e) => {
                                      setReplyText(e.target.value);
                                      setCommentError('');
                                    }}
                                    placeholder={`Reply to ${comment.user?.fullName || 'this comment'}...`}
                                    rows={3}
                                    maxLength={500}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-foreground placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                  <div className="mt-2 flex items-center justify-between gap-3">
                                    <p className="text-xs text-gray-500">{replyText.length}/500</p>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReplyTargetId(null);
                                          setReplyText('');
                                          setCommentError('');
                                        }}
                                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-foreground transition-colors hover:bg-gray-100"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSubmitComment(comment._id)}
                                        disabled={submittingReplyId === comment._id}
                                        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {submittingReplyId === comment._id ? 'Replying...' : 'Post reply'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {comment.replies && comment.replies.length > 0 && (
                                <div className="mt-4 space-y-3 border-l-2 border-border pl-4">
                                  {comment.replies.map((reply) => {
                                    const isOwnReply = reply.user?._id === currentUser?._id;
                                    const canRemoveReply = isOwnReply || isAdmin;

                                    return (
                                      <div key={reply._id} className="rounded-lg border border-border bg-gray-50 p-3">
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="min-w-0 flex-1">
                                            <p className="text-foreground">
                                              <ProfileName name={reply.user?.fullName || 'User'} role={reply.user?.role} />
                                              {isOwnReply && (
                                                <span className="ml-2 rounded-md bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                                                  Your reply
                                                </span>
                                              )}
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{reply.comment}</p>
                                            <p className="mt-2 text-xs text-gray-500">{formatDisplayDate(reply.createdAt)}</p>
                                            <button
                                              type="button"
                                              onClick={() => handleToggleCommentLike(reply._id)}
                                              className={`mt-3 inline-flex items-center gap-1 text-sm transition-colors ${
                                                reply.isLikedByCurrentUser ? 'text-red-600' : 'text-muted-foreground hover:text-red-600'
                                              }`}
                                            >
                                              <Heart
                                                size={16}
                                                className={reply.isLikedByCurrentUser ? 'fill-red-500 text-red-500' : ''}
                                              />
                                              {reply.likeCount} {reply.likeCount === 1 ? 'like' : 'likes'}
                                            </button>
                                          </div>

                                          {canRemoveReply && (
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveComment(reply._id)}
                                              disabled={removingCommentId === reply._id}
                                              className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              {removingCommentId === reply._id ? 'Removing...' : 'Remove'}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {canRemoveComment && (
                              <button
                                type="button"
                                onClick={() => handleRemoveComment(comment._id)}
                                disabled={removingCommentId === comment._id}
                                className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {removingCommentId === comment._id ? 'Removing...' : 'Remove'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
                  </>
                );
              })()}
            </>
          )}
        </div>

        <UploadPdfModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onUpload={handleUploadPdf}
          paperTitle={paper?.title || ''}
        />
      </div>
    </div>
  );
}
