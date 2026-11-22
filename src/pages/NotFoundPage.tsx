import { Link } from 'react-router'
import { buttonClass } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="font-semibold">페이지를 찾을 수 없습니다.</p>
      <Link to="/" className={buttonClass('secondary', 'md', 'mt-6')}>
        노트 목록으로
      </Link>
    </div>
  )
}
