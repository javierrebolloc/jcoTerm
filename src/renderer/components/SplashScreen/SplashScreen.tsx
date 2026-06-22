import styles from './SplashScreen.module.css'

export default function SplashScreen(): JSX.Element {
  return (
    <div className={styles.splash}>
      <span className={styles.title}>jcoTerm</span>
    </div>
  )
}
